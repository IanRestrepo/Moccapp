// Generación y ampliación del banco de preguntas. Es el ÚNICO lugar (junto con la corrección de
// abiertas) que llama a Gemini; los exámenes se arman desde el banco sin IA.
import { eq, max } from 'drizzle-orm'
import { db } from '../db/client.js'
import { questionBank, sources, type GeminiFileRef, type Source } from '../db/schema.js'
import { env } from '../env.js'
import { getLlm, type Part } from '../ai/gemini.js'
import { BANK_PROMPT_VERSION, BANK_SYSTEM_PROMPT, bankUserPrompt, expandUserPrompt } from '../ai/prompts.js'
import {
  INITIAL_BANK_PLANS,
  QuestionBankResponseSchema,
  parseQuestions,
  questionBankJsonSchema,
  normalize,
  toQuestionData,
  type GeneratedQuestion,
  type GenerationPlan,
} from '../ai/schemas.js'
import { AppError, Errors } from '../lib/errors.js'
import { withRetry } from '../lib/retry.js'
import { hashPrompt } from './ingest/hash.js'
import { splitPdf } from './ingest/pdf-split.js'
import { storage } from './storage.js'

/** Si después del banco inicial quedan menos, se hace una llamada extra */
const MIN_BANK = 15
const log = (id: string, msg: string) => console.log(`[bank ${id.slice(0, 8)}] ${msg}`)

// ── Fuente → partes para Gemini ──────────────────────────────

export async function buildSourceParts(source: Source): Promise<Part[]> {
  if (source.extractedText) {
    return [{ text: `FUENTE DE ESTUDIO ("${source.title}"):\n"""\n${source.extractedText}\n"""` }]
  }
  if (source.kind === 'youtube') {
    // solo videos públicos; Gemini lee audio y fotogramas directamente
    return [{ fileData: { fileUri: source.youtubeUrl! } }]
  }
  if (!source.storageKey || !source.mimeType) throw Errors.noContent()

  const MB = 1024 * 1024
  const size = source.sizeBytes ?? 0
  const isPdf = source.mimeType === 'application/pdf'
  const needsSplit = isPdf && size > env.GEMINI_PDF_CHUNK_MAX_MB * MB

  if (!needsSplit && size <= env.GEMINI_INLINE_MAX_MB * MB) {
    const data = (await storage.read(source.storageKey)).toString('base64')
    return [{ inlineData: { data, mimeType: source.mimeType } }]
  }

  // Archivo grande → File API. Se reutiliza mientras no caduque (con 1 h de margen).
  const valid = (r: GeminiFileRef) => new Date(r.expiresAt).getTime() > Date.now() + 3600_000
  let refs = source.geminiFiles.length && source.geminiFiles.every(valid) ? source.geminiFiles : null
  if (!refs) {
    refs = await uploadToGemini(source, needsSplit)
    await db.update(sources).set({ geminiFiles: refs }).where(eq(sources.id, source.id))
  }

  return refs.flatMap((r): Part[] => {
    const file: Part = { fileData: { fileUri: r.uri, mimeType: r.mimeType } }
    return r.fromPage
      ? [{ text: `PDF original, páginas ${r.fromPage} a ${r.toPage}. La primera página de este archivo es la página ${r.fromPage} del original:` }, file]
      : [file]
  })
}

async function uploadToGemini(source: Source, split: boolean): Promise<GeminiFileRef[]> {
  const name = source.originalName ?? source.title
  const mimeType = source.mimeType!
  if (!split) {
    const up = await withRetry(() => getLlm().uploadFile(storage.localPath(source.storageKey!), mimeType, name))
    return [{ uri: up.uri, mimeType: up.mimeType, expiresAt: up.expiresAt.toISOString() }]
  }
  const chunks = await splitPdf(await storage.read(source.storageKey!), env.GEMINI_PDF_CHUNK_MAX_MB * 1024 * 1024)
  log(source.id, `PDF de ${((source.sizeBytes ?? 0) / 1e6).toFixed(0)} MB dividido en ${chunks.length} partes`)
  return Promise.all(
    chunks.map(async (c) => {
      const blob = new Blob([c.bytes as Uint8Array<ArrayBuffer>], { type: mimeType })
      const up = await withRetry(() => getLlm().uploadFile(blob, mimeType, `${name} (pp. ${c.fromPage}-${c.toPage})`))
      return { uri: up.uri, mimeType: up.mimeType, expiresAt: up.expiresAt.toISOString(), fromPage: c.fromPage, toPage: c.toPage }
    }),
  )
}

// ── Una llamada de generación ────────────────────────────────

interface BatchResult {
  title: string
  topics: string[]
  insufficient: boolean
  questions: GeneratedQuestion[]
  rejected: number
}

async function generateBatch(prompt: string, parts: Part[]): Promise<BatchResult> {
  const raw = await getLlm().generateJson({
    system: BANK_SYSTEM_PROMPT,
    source: parts,
    prompt,
    jsonSchema: questionBankJsonSchema,
    temperature: 0.4,
  })
  const parsed = QuestionBankResponseSchema.safeParse(raw)
  if (!parsed.success) throw new AppError(502, 'AI_BAD_SHAPE', Errors.aiFailed().message, true)
  const { valid, rejected } = parseQuestions(parsed.data.questions)
  // Un lote donde casi todo vino dañado se reintenta en vez de guardarse a medias
  if (!parsed.data.insufficientContent && valid.length === 0 && rejected > 0)
    throw new AppError(502, 'AI_BAD_QUESTIONS', Errors.aiFailed().message, true)
  return {
    title: parsed.data.title,
    topics: parsed.data.topics,
    insufficient: parsed.data.insufficientContent,
    questions: valid,
    rejected,
  }
}

const generateWithRetry = (sourceId: string, prompt: string, parts: Part[]) =>
  withRetry(() => generateBatch(prompt, parts), {
    onRetry: (err, attempt, delay) => {
      const cause = err instanceof Error && err.cause instanceof Error ? ` · ${err.cause.message.slice(0, 160)}` : ''
      log(sourceId, `reintento ${attempt} en ${Math.round(delay)} ms (${err instanceof AppError ? err.code : err}${cause})`)
    },
  })

/** "Página 54 (PDF 2, p. 16)" → "Página 54": a veces el modelo mezcla la numeración de las partes */
export function cleanLocation(raw: string): string | null {
  const clean = raw
    .replace(/\s*[(\[][^)\]]*\b(pdf|parte|archivo)\b[^)\]]*[)\]]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return clean || null
}

const TOPIC_STOP = new Set(['anatomia', 'comparada', 'comparado', 'comparadas', 'sistema', 'general', 'generalidades'])
const topicKeys = (t: string) =>
  new Set(
    normalize(t)
      .split(' ')
      .filter((w) => w.length > 3 && !TOPIC_STOP.has(w))
      .map((w) => w.slice(0, 5)),
  )

/**
 * Une los temas de las llamadas paralelas sin repetir variantes del mismo tema
 * ("Faringe, esófago y deglución" ≈ "Faringe, laringe y mecanismo de deglución").
 */
export function mergeTopics(all: string[], limit = 12): string[] {
  const kept: { topic: string; keys: Set<string> }[] = []
  for (const raw of all) {
    const topic = raw.trim()
    const keys = topicKeys(topic)
    if (!topic || !keys.size) continue
    const dup = kept.some((k) => {
      const shared = [...keys].filter((x) => k.keys.has(x)).length
      return shared / Math.min(keys.size, k.keys.size) >= 0.5
    })
    if (!dup) kept.push({ topic, keys })
  }
  return kept.slice(0, limit).map((k) => k.topic)
}

/** Inserta sin duplicar (prompt_hash único por fuente). Devuelve cuántas entraron. */
export async function insertQuestions(sourceId: string, questions: GeneratedQuestion[], batch: number): Promise<number> {
  if (!questions.length) return 0
  const seen = new Set<string>()
  const rows = questions
    .map((q) => ({
      sourceId,
      type: q.type,
      difficulty: q.difficulty as 1 | 2 | 3 | 4,
      topic: q.topic.trim(),
      prompt: q.prompt.trim(),
      data: toQuestionData(q),
      explanation: q.explanation.trim(),
      sourceQuote: q.sourceQuote.trim(),
      sourceLocation: cleanLocation(q.sourceLocation),
      generationBatch: batch,
      promptVersion: BANK_PROMPT_VERSION,
      promptHash: hashPrompt(q.prompt),
    }))
    .filter((r) => !seen.has(r.promptHash) && seen.add(r.promptHash))
  const inserted = await db.insert(questionBank).values(rows).onConflictDoNothing().returning({ id: questionBank.id })
  return inserted.length
}

// ── Banco inicial ────────────────────────────────────────────

async function generateInitialBank(sourceId: string): Promise<void> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId))
  if (!source) return
  const started = Date.now()
  const parts = await buildSourceParts(source)
  const hint = source.titleLocked ? { title: source.title } : undefined

  // 2 llamadas en paralelo (niveles 1–2 y 3–4): más rápido y menos riesgo de JSON cortado
  const settled = await Promise.allSettled(
    INITIAL_BANK_PLANS.map((plan) => generateWithRetry(sourceId, bankUserPrompt(plan, hint), parts)),
  )
  const ok = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (!ok.length) throw (settled[0] as PromiseRejectedResult).reason
  if (ok.every((r) => r.insufficient || r.questions.length === 0)) throw Errors.noContent()

  let total = 0
  for (const r of ok) total += await insertQuestions(sourceId, r.questions, 0)

  if (total < MIN_BANK) {
    log(sourceId, `solo ${total} preguntas válidas; pidiendo más`)
    const existing = await db.select({ prompt: questionBank.prompt }).from(questionBank).where(eq(questionBank.sourceId, sourceId))
    const extra = await generateWithRetry(
      sourceId,
      expandUserPrompt({ byDifficulty: { 1: 6, 2: 6, 3: 6, 4: 6 }, byType: { multiple_choice: 14, true_false: 4, matching: 2, short_answer: 4 } }, existing.map((e) => e.prompt)),
      parts,
    ).catch(() => null)
    if (extra) total += await insertQuestions(sourceId, extra.questions, 1)
  }
  if (total === 0) throw Errors.noContent()

  const topics = mergeTopics(ok.flatMap((r) => r.topics))
  const aiTitle = ok.find((r) => r.title.trim().length >= 3)?.title.trim()
  await db
    .update(sources)
    .set({
      status: 'ready',
      errorMessage: null,
      topics,
      ...(!source.titleLocked && aiTitle ? { title: aiTitle } : {}),
      updatedAt: new Date(),
    })
    .where(eq(sources.id, sourceId))

  const rejected = ok.reduce((s, r) => s + r.rejected, 0)
  log(sourceId, `listo: ${total} preguntas (${rejected} descartadas por Zod) en ${((Date.now() - started) / 1000).toFixed(1)} s`)
}

// ── Ampliación (cuando un examen pide más de lo que hay) ─────

export async function expandBank(sourceId: string, plan: GenerationPlan): Promise<number> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId))
  if (!source) throw Errors.notFound('La fuente')
  const existing = await db
    .select({ prompt: questionBank.prompt })
    .from(questionBank)
    .where(eq(questionBank.sourceId, sourceId))
  const [last] = await db
    .select({ batch: max(questionBank.generationBatch) })
    .from(questionBank)
    .where(eq(questionBank.sourceId, sourceId))
  const batch = last?.batch ?? 0

  const parts = await buildSourceParts(source)
  const result = await generateWithRetry(sourceId, expandUserPrompt(plan, existing.map((e) => e.prompt)), parts)
  const inserted = await insertQuestions(sourceId, result.questions, batch + 1)
  log(sourceId, `ampliado: +${inserted} preguntas`)
  return inserted
}

const expanding = new Map<string, Promise<number>>()

/**
 * Ampliación con "vuelo único": si ya hay una ampliación de esa fuente en curso (por ejemplo la de
 * fondo que lanzó el examen anterior), se espera esa en vez de pagar otra llamada.
 */
export function expandBankOnce(sourceId: string, plan: GenerationPlan): Promise<number> {
  const current = expanding.get(sourceId)
  if (current) return current
  const job = expandBank(sourceId, plan).finally(() => expanding.delete(sourceId))
  expanding.set(sourceId, job)
  return job
}

/** Ampliación en segundo plano: el examen actual no espera; el próximo ya tendrá preguntas nuevas. */
export function queueExpansion(sourceId: string, plan: GenerationPlan): void {
  if (expanding.has(sourceId)) return
  expandBankOnce(sourceId, plan).catch((err) => log(sourceId, `ampliación de fondo falló: ${err instanceof AppError ? err.code : err}`))
}

// ── Cola en segundo plano ────────────────────────────────────

const running = new Map<string, Promise<void>>()

/**
 * Máximo 2 fuentes generándose a la vez (cada una hace 2 llamadas en paralelo). Si sube 5 presentaciones
 * de golpe, las demás esperan su turno en vez de llenar a Gemini de peticiones y recibir 429.
 */
const MAX_PARALLEL = Number(process.env.GEMINI_MAX_PARALLEL_SOURCES ?? 2)
let active = 0
const waiting: (() => void)[] = []
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiting.shift()?.()
  }
}

/** Lanza la generación sin bloquear la respuesta HTTP. Si ya está corriendo para esa fuente, no la duplica. */
export function queueGeneration(sourceId: string): Promise<void> {
  const current = running.get(sourceId)
  if (current) return current
  const job = withSlot(() => generateInitialBank(sourceId))
    .catch(async (err) => {
      const appErr = err instanceof AppError ? err : Errors.aiFailed()
      if (!(err instanceof AppError)) console.error(err)
      log(sourceId, `error: ${appErr.code}`)
      await db
        .update(sources)
        .set({ status: 'error', errorMessage: appErr.message, updatedAt: new Date() })
        .where(eq(sources.id, sourceId))
    })
    .finally(() => running.delete(sourceId))
  running.set(sourceId, job)
  return job
}

/** Al arrancar: retoma las fuentes que quedaron a medias si el servidor se cayó. */
export async function resumePending(): Promise<void> {
  const pending = await db.select({ id: sources.id }).from(sources).where(eq(sources.status, 'processing'))
  for (const { id } of pending) {
    // si quedaron preguntas de un intento anterior, se borran para no mezclar lotes
    await db.delete(questionBank).where(eq(questionBank.sourceId, id))
    void queueGeneration(id)
  }
  if (pending.length) console.log(`[bank] retomando ${pending.length} fuente(s) pendientes`)
}
