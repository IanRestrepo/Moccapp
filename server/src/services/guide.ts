// Guía de estudio de una fuente: el tema COMPLETO explicado por secciones, con términos, tablas, mapa conceptual
// y lista de "lo que debes saber". Una llamada a Gemini por fuente; se guarda y la comparten todas las que la ven.
import { count, eq, inArray } from 'drizzle-orm'
import type { ConceptNode, GuideSection, StudyGuide, StudyGuideDTO } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { questionBank, studyGuides, sources, type StudyGuideRow } from '../db/schema.js'
import { getLlm } from '../ai/gemini.js'
import { GUIDE_SYSTEM_PROMPT, guideUserPrompt } from '../ai/prompts.js'
import { GuideResponseSchema, guideJsonSchema, type GuideResponse } from '../ai/schemas.js'
import { background } from '../lib/background.js'
import { AppError, Errors } from '../lib/errors.js'
import { withRetry } from '../lib/retry.js'
import { buildSourceParts } from './bank.js'
import { findImages } from './images.js'
import { getSource } from './sources.js'

const log = (id: string, msg: string) => console.log(`[guía ${id.slice(0, 8)}] ${msg}`)

/** Más de esto "preparando" = el trabajo murió (reinicio, límite de Vercel): se puede volver a intentar */
const STALE_MS = 6 * 60_000
const isStale = (row: StudyGuideRow, now = Date.now()) => row.status === 'generating' && now - row.startedAt.getTime() > STALE_MS

const clean = (s: string) => s.replace(/\s+\n/g, '\n').trim()
const leaf = (n: { label: string; detail: string; children?: unknown[] }): ConceptNode => ({
  label: n.label.trim(),
  ...(n.detail.trim() ? { detail: n.detail.trim() } : {}),
})

/** Logística del curso (cómo se dicta y se califica): no es tema de estudio y no debe salir en guías ni mapas */
const LOGISTIC_WORD = '(metodolog[ií]a|evaluaci[oó]n|calificaci[oó]n|cronograma|bibliograf[ií]a|talleres|ex[aá]menes|trabajos|actividades|estrategias|clases|notas)'
const COURSE_LOGISTICS = new RegExp(
  [
    // palabras genéricas solas o combinadas entre sí ("Metodología y Clases"); "Estrategias de inmunización" sí es tema
    `^\\s*${LOGISTIC_WORD}(\\s+(y|e)\\s+${LOGISTIC_WORD})*\\s*$`,
    'clases? magistral',
    'seminario alem[aá]n',
    'porcentaje de (la )?nota',
    'sistema de evaluaci[oó]n',
    'organizaci[oó]n acad[eé]mica',
    '(del|de la) (curso|asignatura)(\\s|$)',
    'datos del docente',
    'cronograma',
    'syllabus',
    'examen (escrito|parcial|final) \\d',
    'vale el \\d+ ?%',
    '^\\s*(taller|quiz|parcial) \\d',
  ].join('|'),
  'i',
)
const isCourseLogistics = (s: string) => COURSE_LOGISTICS.test(s)

/**
 * Quita de una guía lo que sea logística del curso (también de las ya guardadas). Si al quitarlo no queda nada
 * (la fuente entera es el programa del curso), se deja como estaba.
 */
export function withoutLogistics(g: StudyGuide): StudyGuide {
  const sections = g.sections.filter((s) => !isCourseLogistics(s.title))
  const branches = g.conceptMap.branches
    .filter((b) => !isCourseLogistics(b.label))
    .map((b) => ({ ...b, children: b.children?.filter((c) => !isCourseLogistics(c.label) && !isCourseLogistics(c.detail ?? '')) }))
  return {
    ...g,
    sections: sections.length ? sections : g.sections,
    conceptMap: { ...g.conceptMap, branches: branches.length ? branches : g.conceptMap.branches },
    checklist: g.checklist.filter((c) => !isCourseLogistics(c)),
  }
}

/** Búsquedas de imágenes de cada sección que quedó en la guía (mismo orden que guide.sections) */
export const imageQueries = (r: GuideResponse) =>
  r.sections.filter((s) => s.title.trim() && s.summary.trim()).map((s) => ({ images: s.images.filter((i) => i.query.trim()) }))

/** Lo que manda Gemini → la guía que se guarda (sin vacíos ni tablas rotas). Las imágenes se buscan aparte. */
export function toGuide(r: GuideResponse): StudyGuide {
  const sections: GuideSection[] = r.sections
    .map((s) => ({
      title: s.title.trim(),
      location: s.location.trim(),
      summary: clean(s.summary),
      keyPoints: s.keyPoints.map((k) => k.trim()).filter(Boolean),
      terms: s.terms.map((t) => ({ term: t.term.trim(), definition: t.definition.trim() })).filter((t) => t.term && t.definition),
      tables: s.tables
        .filter((t) => t.columns.length >= 2 && t.rows.length >= 1)
        .map((t) => ({
          title: t.title.trim(),
          columns: t.columns,
          // cada fila con tantas celdas como columnas
          rows: t.rows.map((row) => t.columns.map((_, i) => row[i]?.trim() ?? '')),
        })),
      tip: s.tip.trim(),
      bankTopics: s.bankTopics.map((b) => b.trim()).filter(Boolean),
      images: [],
    }))
    .filter((s) => s.title && s.summary)
  return {
    overview: r.overview.trim(),
    sections,
    conceptMap: {
      center: r.conceptMap.center.trim(),
      branches: r.conceptMap.branches
        .filter((b) => b.label.trim())
        .map((b) => ({
          ...leaf(b),
          children: b.children.filter((c) => c.label.trim()).map((c) => ({ ...leaf(c), children: c.children.filter((d) => d.label.trim()).map(leaf) })),
        })),
    },
    checklist: r.checklist.map((c) => c.trim()).filter(Boolean),
  }
}

async function generate(sourceId: string): Promise<void> {
  const started = Date.now()
  try {
    const [source] = await db.select().from(sources).where(eq(sources.id, sourceId))
    if (!source) return
    const parts = await buildSourceParts(source)
    const topics = [...new Set((await db.select({ topic: questionBank.topic }).from(questionBank).where(eq(questionBank.sourceId, sourceId))).map((q) => q.topic))]
    const { g: guide, queries } = await withRetry(
      async () => {
        const raw = await getLlm().generateJson({
          system: GUIDE_SYSTEM_PROMPT,
          source: parts,
          prompt: guideUserPrompt(source.title, topics),
          jsonSchema: guideJsonSchema,
          temperature: 0.3,
          // razonar a fondo puede tardar más de 5 min (el límite de Vercel); con poco razonamiento llega en ~1 min
          thinking: 'low',
        })
        const parsed = GuideResponseSchema.safeParse(raw)
        if (!parsed.success) throw new AppError(502, 'AI_BAD_SHAPE', Errors.aiFailed().message, true)
        if (parsed.data.insufficientContent) throw Errors.noContent()
        const g = toGuide(parsed.data)
        if (g.sections.length === 0) throw new AppError(502, 'AI_EMPTY_GUIDE', Errors.aiFailed().message, true)
        return { g, queries: imageQueries(parsed.data) }
      },
      { onRetry: (err, attempt) => log(sourceId, `reintento ${attempt} (${err instanceof AppError ? err.code : err})`) },
    )
    // imágenes de Wikimedia Commons para cada sección (si Commons falla, la guía queda sin imágenes)
    log(sourceId, `buscando imágenes: ${queries.map((q) => q.images.map((i) => i.query).join(' + ') || '—').join(' | ')}`)
    const images = await findImages(queries)
    guide.sections.forEach((s, i) => (s.images = images[i] ?? []))
    await db.update(studyGuides).set({ status: 'ready', data: guide, errorMessage: null, updatedAt: new Date() }).where(eq(studyGuides.sourceId, sourceId))
    log(sourceId, `lista: ${guide.sections.length} secciones, ${images.flat().length} imágenes, en ${((Date.now() - started) / 1000).toFixed(0)} s`)
  } catch (err) {
    const appErr = err instanceof AppError ? err : Errors.aiFailed()
    if (!(err instanceof AppError)) console.error(err)
    log(sourceId, `error: ${appErr.code}`)
    await db
      .update(studyGuides)
      .set({ status: 'error', errorMessage: appErr.message, updatedAt: new Date() })
      .where(eq(studyGuides.sourceId, sourceId))
      .catch(() => {})
  }
}

const running = new Map<string, Promise<void>>()

/** Arranca la guía si no existe o quedó colgada; con `retry`, la rehace aunque haya fallado o ya esté lista. */
export async function ensureGuide(sourceId: string, retry = false): Promise<void> {
  if (running.has(sourceId)) return
  const [row] = await db.select().from(studyGuides).where(eq(studyGuides.sourceId, sourceId))
  if (row && ((row.status === 'generating' && !isStale(row)) || (!retry && row.status !== 'generating'))) return
  const values = { status: 'generating' as const, errorMessage: null, startedAt: new Date(), updatedAt: new Date() }
  // solo un arranque gana aunque lleguen dos peticiones a la vez
  const claimed = row
    ? await db.update(studyGuides).set(values).where(eq(studyGuides.sourceId, sourceId)).returning()
    : await db.insert(studyGuides).values({ sourceId, ...values }).onConflictDoNothing().returning()
  if (!claimed.length) return
  const job = generate(sourceId).finally(() => running.delete(sourceId))
  running.set(sourceId, job)
  background(job)
}

/** Guías de varias fuentes (para el camino) */
export async function guidesFor(sourceIds: string[]): Promise<Map<string, StudyGuideRow>> {
  if (!sourceIds.length) return new Map()
  const rows = await db.select().from(studyGuides).where(inArray(studyGuides.sourceId, sourceIds))
  return new Map(rows.map((r) => [r.sourceId, { ...r, data: r.data && withoutLogistics(r.data) }]))
}

export const guideStatus = (row: StudyGuideRow | undefined): StudyGuideDTO['status'] =>
  !row ? 'none' : isStale(row) ? 'error' : row.status

export async function getGuide(sourceId: string, start = true): Promise<StudyGuideDTO> {
  const source = await getSource(sourceId)
  if (source.status !== 'ready') throw new AppError(409, 'NOT_READY', 'Esta fuente todavía se está preparando.')
  if (start) await ensureGuide(sourceId)
  const [row] = await db.select().from(studyGuides).where(eq(studyGuides.sourceId, sourceId))
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(questionBank).where(eq(questionBank.sourceId, sourceId))
  const status = guideStatus(row)
  return {
    sourceId,
    title: source.title,
    color: source.color,
    status,
    guide: status === 'ready' && row!.data ? withoutLogistics(row!.data) : null,
    error: status === 'error' ? (row?.errorMessage ?? 'La guía se demoró demasiado. Intenta de nuevo.') : null,
    questions: n,
  }
}

export async function retryGuide(sourceId: string): Promise<StudyGuideDTO> {
  await getSource(sourceId)
  await ensureGuide(sourceId, true)
  return getGuide(sourceId, false)
}
