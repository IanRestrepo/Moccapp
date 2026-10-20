import { asc, count, desc, eq, inArray, max } from 'drizzle-orm'
import {
  SOURCE_COLORS,
  type BankStats,
  type Difficulty,
  type QuestionType,
  type SourceColor,
  type SourceDTO,
} from '@vetquiz/shared'
import { db } from '../db/client.js'
import { exams, questionBank, sources, type NewSource, type Source } from '../db/schema.js'
import { AppError, Errors } from '../lib/errors.js'
import { queueGeneration } from './bank.js'
import { hashFile, hashText, hashYoutube, normalizeText } from './ingest/hash.js'
import { detectFileKind, formatFromMime, titleFromFilename } from './ingest/files.js'
import { extractDocx, extractPptx } from './ingest/office.js'
import { canonicalYoutubeUrl, fetchYoutubeMeta, parseYoutubeId } from './ingest/youtube.js'
import { storage } from './storage.js'

export interface CreateResult {
  source: Source
  deduplicated: boolean
}

// ── Creación ─────────────────────────────────────────────────

async function nextColor(): Promise<SourceColor> {
  const [row] = await db.select({ n: count() }).from(sources)
  return SOURCE_COLORS[(row?.n ?? 0) % SOURCE_COLORS.length]!
}

/** Misma fuente ya subida → se devuelve la existente sin llamar a la IA (si falló antes, se reintenta). */
async function findDuplicate(contentHash: string): Promise<CreateResult | null> {
  const [existing] = await db.select().from(sources).where(eq(sources.contentHash, contentHash))
  if (!existing) return null
  if (existing.status === 'error') {
    const [updated] = await db
      .update(sources)
      .set({ status: 'processing', errorMessage: null, updatedAt: new Date() })
      .where(eq(sources.id, existing.id))
      .returning()
    void queueGeneration(existing.id)
    return { source: updated!, deduplicated: true }
  }
  return { source: existing, deduplicated: true }
}

async function insertAndQueue(values: Omit<NewSource, 'color'>): Promise<CreateResult> {
  let source: Source
  try {
    ;[source] = (await db
      .insert(sources)
      .values({ ...values, color: await nextColor() })
      .returning()) as [Source]
  } catch (err) {
    // carrera: dos subidas iguales al mismo tiempo → gana la primera
    const dup = await findDuplicate(values.contentHash)
    if (dup) return dup
    throw err
  }
  void queueGeneration(source.id)
  return { source, deduplicated: false }
}

export async function createFileSource(
  file: { originalname: string; mimetype: string; buffer: Buffer },
  title?: string,
): Promise<CreateResult> {
  const kind = detectFileKind(file.originalname, file.mimetype, file.buffer)
  const contentHash = hashFile(file.buffer)
  const dup = await findDuplicate(contentHash)
  if (dup) return dup

  let extractedText: string | null = null
  if (kind.format === 'docx') extractedText = await extractDocx(file.buffer)
  else if (kind.format === 'pptx') extractedText = await extractPptx(file.buffer)
  else if (kind.format === 'text') {
    extractedText = normalizeText(file.buffer.toString('utf8'))
    if (extractedText.length < 200) throw new AppError(400, 'TEXT_TOO_SHORT', 'Ese archivo tiene muy poco texto para hacer un examen.')
  }

  const storageKey = await storage.save(file.buffer, kind.ext)
  try {
    return await insertAndQueue({
      title: title ?? titleFromFilename(file.originalname),
      titleLocked: Boolean(title),
      kind: 'file',
      contentHash,
      originalName: file.originalname,
      mimeType: kind.mimeType,
      sizeBytes: file.buffer.length,
      storageKey,
      extractedText,
    })
  } catch (err) {
    await storage.remove(storageKey)
    throw err
  }
}

export async function createTextSource(text: string, title?: string): Promise<CreateResult> {
  const normalized = normalizeText(text)
  const contentHash = hashText(normalized)
  const dup = await findDuplicate(contentHash)
  if (dup) return dup
  const firstLine = normalized.split('\n')[0]!.slice(0, 60)
  return insertAndQueue({
    title: title ?? (firstLine || 'Texto pegado'),
    titleLocked: Boolean(title),
    kind: 'text',
    contentHash,
    extractedText: normalized,
  })
}

export async function createYoutubeSource(url: string, title?: string): Promise<CreateResult> {
  const videoId = parseYoutubeId(url)
  if (!videoId) throw Errors.invalidYoutube()
  const contentHash = hashYoutube(videoId)
  const dup = await findDuplicate(contentHash)
  if (dup) return dup
  const meta = await fetchYoutubeMeta(videoId) // lanza VIDEO_UNAVAILABLE si es privado o no existe
  return insertAndQueue({
    title: title ?? meta.title ?? 'Video de YouTube',
    titleLocked: Boolean(title),
    kind: 'youtube',
    contentHash,
    youtubeUrl: canonicalYoutubeUrl(videoId),
    youtubeVideoId: videoId,
    thumbnailUrl: meta.thumbnailUrl,
  })
}

export async function retrySource(id: string): Promise<Source> {
  const source = await getSource(id)
  if (source.status !== 'error') throw Errors.conflict('NOT_FAILED', 'Esta fuente no tiene errores que reintentar.')
  await db.delete(questionBank).where(eq(questionBank.sourceId, id))
  const [updated] = await db
    .update(sources)
    .set({ status: 'processing', errorMessage: null, updatedAt: new Date() })
    .where(eq(sources.id, id))
    .returning()
  void queueGeneration(id)
  return updated!
}

export async function getSource(id: string): Promise<Source> {
  const [source] = await db.select().from(sources).where(eq(sources.id, id))
  if (!source) throw Errors.notFound('La fuente')
  return source
}

export async function deleteSource(id: string): Promise<void> {
  const source = await getSource(id)
  await db.delete(sources).where(eq(sources.id, id))
  if (source.storageKey) await storage.remove(source.storageKey)
}

// ── DTO ──────────────────────────────────────────────────────

const emptyStats = (): BankStats => ({
  total: 0,
  byDifficulty: { 1: 0, 2: 0, 3: 0, 4: 0 },
  byType: { multiple_choice: 0, true_false: 0, matching: 0, short_answer: 0 },
})

/** Arma los DTO con estadísticas del banco y de exámenes en 3 consultas (no N+1). */
export async function toSourceDTOs(rows: Source[]): Promise<SourceDTO[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)

  const bankRows = await db
    .select({ sourceId: questionBank.sourceId, difficulty: questionBank.difficulty, type: questionBank.type, n: count() })
    .from(questionBank)
    .where(inArray(questionBank.sourceId, ids))
    .groupBy(questionBank.sourceId, questionBank.difficulty, questionBank.type)

  const examRows = await db
    .select({ sourceId: exams.sourceId, n: count(), best: max(exams.score) })
    .from(exams)
    .where(inArray(exams.sourceId, ids))
    .groupBy(exams.sourceId)

  // Para PDF/imagen/video no hay texto extraído: la hoja de la carpeta muestra una cita real del banco
  const quotes = await db
    .selectDistinctOn([questionBank.sourceId], { sourceId: questionBank.sourceId, quote: questionBank.sourceQuote })
    .from(questionBank)
    .where(inArray(questionBank.sourceId, ids))
    .orderBy(questionBank.sourceId, asc(questionBank.createdAt))

  const stats = new Map<string, BankStats>()
  for (const r of bankRows) {
    const s = stats.get(r.sourceId) ?? emptyStats()
    s.total += r.n
    s.byDifficulty[r.difficulty as Difficulty] += r.n
    s.byType[r.type as QuestionType] += r.n
    stats.set(r.sourceId, s)
  }
  const examsBy = new Map(examRows.map((r) => [r.sourceId, r]))
  const quoteBy = new Map(quotes.map((q) => [q.sourceId, q.quote]))

  return rows.map((s) => {
    const format = formatFromMime(s.mimeType, s.kind)
    return {
      id: s.id,
      title: s.title,
      kind: s.kind,
      format,
      mimeType: s.mimeType,
      color: s.color,
      status: s.status,
      errorMessage: s.errorMessage,
      topics: s.topics,
      thumbnailUrl: s.thumbnailUrl ?? (format === 'image' ? `/api/sources/${s.id}/file` : null),
      excerpt: (s.extractedText ?? quoteBy.get(s.id) ?? null)?.slice(0, 240) ?? null,
      bank: stats.get(s.id) ?? emptyStats(),
      examsTaken: examsBy.get(s.id)?.n ?? 0,
      bestScore: examsBy.get(s.id)?.best ?? null,
      createdAt: s.createdAt.toISOString(),
    }
  })
}

export async function listSourceDTOs(): Promise<SourceDTO[]> {
  return toSourceDTOs(await db.select().from(sources).orderBy(desc(sources.createdAt)))
}

export async function getSourceDTO(id: string): Promise<SourceDTO> {
  return (await toSourceDTOs([await getSource(id)]))[0]!
}
