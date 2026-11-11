// Camino tipo Duolingo: cada fuente es una unidad y la recorre COMPLETA, sección por sección de su guía de estudio:
// en cada lección primero lee la sección y luego practica con preguntas de esa sección (del banco y de sus términos).
// Al final, un jefe y un cofre. Mientras la guía se prepara, la unidad usa las lecciones por dificultad de antes.
// Sin IA aquí. Las abiertas quedan fuera: esas las corrige Gemini.
import { and, asc, eq, inArray } from 'drizzle-orm'
import type {
  Difficulty,
  GuideSection,
  GuideStatus,
  PathDTO,
  PathLessonDTO,
  PathNodeDTO,
  PathNodeKind,
  PathUnitDTO,
  SourceColor,
  StudyCardDTO,
  StudyGuide,
} from '@vetquiz/shared'
import { db } from '../db/client.js'
import { pathProgress, questionBank, sources, type BankQuestion } from '../db/schema.js'
import { AppError, Errors } from '../lib/errors.js'
import { currentProfile, isOwner, visibleOwners } from '../lib/profile.js'
import { recordActivity } from './gamification.js'
import { ensureGuide, guideStatus, guidesFor } from './guide.js'

interface Spec {
  label: string
  kind: PathNodeKind
  diffs: Difficulty[]
  size: number
}
const SPECS: Spec[] = [
  { label: 'Lo básico', kind: 'lesson', diffs: [1], size: 8 },
  { label: 'Lo básico II', kind: 'lesson', diffs: [1], size: 8 },
  { label: 'Entender', kind: 'lesson', diffs: [2], size: 8 },
  { label: 'Entender II', kind: 'lesson', diffs: [2], size: 8 },
  { label: 'Relacionar', kind: 'lesson', diffs: [3], size: 8 },
  { label: 'Jefe de la unidad', kind: 'boss', diffs: [4, 3], size: 10 },
]
const MIN_LESSON = 4
/** Logística del curso que viene en las diapositivas (fechas, correo del profe…): no sirve para estudiar */
const LOGISTICS =
  /calendario|cronograma|fechas? (de|del) (curso|semestre|ex[aá]men)|contacto|correo|docente|horario|metodolog[ií]a del curso|evaluaci[oó]n del curso|presentaci[oó]n del curso|normas del curso|^\s*(evaluaci[oó]n|metodolog[ií]a)\s*$/i
export const isLogistics = (topic: string) => LOGISTICS.test(topic)
export const CHEST_BONES = 30

interface Node {
  key: string
  kind: PathNodeKind
  label: string
  questions: StudyCardDTO[]
  section?: GuideSection
}
interface Unit {
  sourceId: string
  title: string
  color: SourceColor
  guide: GuideStatus
  nodes: Node[]
}

/** "1.Geopolítica…", "9 Desarrollo…" → 1, 9. Sin número va al final. */
const leadingNumber = (name: string | null) => {
  const m = name?.match(/^\s*(\d{1,3})/)
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY
}

/** Reparte las preguntas de una fuente en lecciones. Estable: el banco crece al final, las lecciones ya hechas no cambian. */
export function splitIntoNodes(sourceId: string, questions: BankQuestion[]): Node[] {
  return splitByDifficulty(sourceId, questions).map((n) => ({ ...n, questions: n.questions.map(toCard) }))
}
function splitByDifficulty(sourceId: string, questions: BankQuestion[]) {
  const nodes: { key: string; kind: PathNodeKind; label: string; questions: BankQuestion[] }[] = []
  const pool = new Map<number, BankQuestion[]>([1, 2, 3, 4].map((d) => [d, questions.filter((q) => q.difficulty === d)]))
  SPECS.forEach((spec, i) => {
    const picked: BankQuestion[] = []
    const take = (d: number, upTo: number) => {
      const list = pool.get(d)!
      while (picked.length < upTo && list.length) picked.push(list.shift()!)
    }
    spec.diffs.forEach((d) => take(d, spec.size))
    // si su nivel no alcanza, rellena con el nivel más cercano solo hasta el mínimo
    const near = [1, 2, 3, 4]
      .filter((d) => !spec.diffs.includes(d as Difficulty))
      .sort((a, b) => Math.abs(a - spec.diffs[0]!) - Math.abs(b - spec.diffs[0]!))
    near.forEach((d) => take(d, MIN_LESSON))
    if (picked.length < MIN_LESSON) return void picked.forEach((q) => pool.get(q.difficulty)!.unshift(q))
    nodes.push({ key: `${sourceId}:${i}`, kind: spec.kind, label: spec.label, questions: picked })
  })
  if (nodes.length) nodes.push({ key: `${sourceId}:chest`, kind: 'chest', label: 'Cofre', questions: [] })
  return nodes
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Preguntas hechas con los términos de la guía: "¿qué término corresponde a esta definición?" */
export function termCards(sourceId: string, sectionIndex: number, guide: StudyGuide, max = 4): StudyCardDTO[] {
  const section = guide.sections[sectionIndex]!
  const all = guide.sections.flatMap((s, si) => s.terms.map((t) => ({ ...t, si })))
  const cards: StudyCardDTO[] = []
  section.terms.slice(0, max).forEach((t, j) => {
    // distractores: primero términos de la misma sección, luego de las vecinas
    const others = all
      .filter((o) => norm(o.term) !== norm(t.term))
      .sort((a, b) => Math.abs(a.si - sectionIndex) - Math.abs(b.si - sectionIndex))
    const picked: typeof others = []
    for (const o of others) if (picked.length < 3 && !picked.some((p) => norm(p.term) === norm(o.term))) picked.push(o)
    if (picked.length < 3) return
    cards.push({
      id: `${sourceId}:s${sectionIndex}:t${j}`,
      sourceId,
      type: 'multiple_choice',
      topic: section.title,
      difficulty: 1,
      prompt: `¿Qué término corresponde a esta definición?\n«${t.definition}»`,
      data: {
        type: 'multiple_choice',
        options: [t.term, ...picked.map((p) => p.term)],
        correctIndex: 0,
        distractorRationales: picked.map((p, i) => ({ optionIndex: i + 1, why: `${p.term}: ${p.definition}` })),
      },
      explanation: `${t.term}: ${t.definition}`,
      sourceQuote: t.definition,
      sourceLocation: section.location || null,
    })
  })
  return cards
}

const SECTION_BANK_MAX = 6
const SECTION_MAX = 9

/** Unidad desde la guía: una lección por sección (leer + practicar), jefe con lo más difícil y cofre */
export function guideNodes(sourceId: string, guide: StudyGuide, questions: BankQuestion[]): Node[] {
  const used = new Set<string>()
  const nodes: Node[] = guide.sections.map((section, i) => {
    const topics = new Set(section.bankTopics.map(norm))
    const fromBank = questions
      .filter((q) => !used.has(q.id) && topics.has(norm(q.topic)))
      .sort((a, b) => a.difficulty - b.difficulty)
      .slice(0, SECTION_BANK_MAX)
    fromBank.forEach((q) => used.add(q.id))
    const terms = termCards(sourceId, i, guide, Math.max(2, SECTION_MAX - fromBank.length))
    return { key: `${sourceId}:s${i}`, kind: 'lesson' as const, label: section.title, section, questions: [...terms, ...fromBank.map(toCard)] }
  })
  // jefe: primero las difíciles que no salieron en las secciones, luego las demás difíciles
  const hard = questions
    .filter((q) => q.difficulty >= 3)
    .sort((a, b) => Number(used.has(a.id)) - Number(used.has(b.id)) || b.difficulty - a.difficulty)
    .slice(0, 10)
  if (hard.length >= MIN_LESSON) nodes.push({ key: `${sourceId}:boss`, kind: 'boss', label: 'Jefe de la unidad', questions: hard.map(toCard) })
  nodes.push({ key: `${sourceId}:chest`, kind: 'chest', label: 'Cofre', questions: [] })
  return nodes
}

async function buildUnits(): Promise<Unit[]> {
  const srcs = await db
    .select()
    .from(sources)
    .where(and(eq(sources.status, 'ready'), inArray(sources.owner, visibleOwners())))
    .orderBy(asc(sources.createdAt))
  if (!srcs.length) return []
  const qs = await db
    .select()
    .from(questionBank)
    .where(
      inArray(
        questionBank.sourceId,
        srcs.map((s) => s.id),
      ),
    )
    .orderBy(asc(questionBank.createdAt), asc(questionBank.id))
  const bySource = new Map<string, BankQuestion[]>()
  for (const q of qs)
    if (q.type !== 'short_answer' && !isLogistics(q.topic)) bySource.set(q.sourceId, [...(bySource.get(q.sourceId) ?? []), q])
  const guides = await guidesFor(srcs.map((s) => s.id))
  return srcs
    .sort((a, b) => leadingNumber(a.originalName) - leadingNumber(b.originalName))
    .map((s) => {
      const row = guides.get(s.id)
      const guide = guideStatus(row)
      const questions = bySource.get(s.id) ?? []
      const nodes = guide === 'ready' && row?.data?.sections.length ? guideNodes(s.id, row.data, questions) : splitIntoNodes(s.id, questions)
      return { sourceId: s.id, title: s.title, color: s.color, guide, nodes }
    })
    .filter((u) => u.nodes.length)
}

async function progressMap() {
  const rows = await db.select().from(pathProgress).where(eq(pathProgress.profile, currentProfile()))
  return new Map(rows.map((r) => [r.nodeKey, r]))
}

/**
 * Cada unidad (carpeta) se desbloquea por separado: puede estudiar la que quiera.
 * Dentro de una unidad, en fila: el primer nodo sin completar es el actual y los de después quedan bloqueados.
 * `currentKey` = el nodo actual de la primera unidad sin terminar (a donde se desplaza el mapa).
 */
function withStatus(units: Unit[], progress: Map<string, { stars: number }>) {
  let currentKey: string | null = null
  const flat: { node: Node; dto: PathNodeDTO; unitId: string }[] = []
  const dtoUnits: PathUnitDTO[] = units.map((u) => {
    let unitCurrent: string | null = null
    return {
      sourceId: u.sourceId,
      title: u.title,
      color: u.color,
      guide: u.guide,
      nodes: u.nodes.map((n) => {
        const p = progress.get(n.key)
        let status: PathNodeDTO['status'] = 'done'
        if (!p) {
          status = unitCurrent ? 'locked' : 'current'
          unitCurrent ??= n.key
          currentKey ??= n.key
        }
        const dto: PathNodeDTO = {
          key: n.key,
          kind: n.kind,
          label: n.label,
          status,
          stars: p?.stars ?? 0,
          questionCount: n.questions.length,
        }
        flat.push({ node: n, dto, unitId: u.sourceId })
        return dto
      }),
    }
  })
  return { dtoUnits, currentKey, flat }
}

/** Guías que se empiezan a preparar cada vez que abre el camino (de a poco, para no saturar a Gemini) */
const GUIDES_PER_VISIT = 2

export async function getPath(): Promise<PathDTO> {
  const units = await buildUnits()
  for (const u of units.filter((u) => u.guide === 'none').slice(0, GUIDES_PER_VISIT)) await ensureGuide(u.sourceId).catch(() => {})
  const { dtoUnits, currentKey, flat } = withStatus(units, await progressMap())
  return { units: dtoUnits, currentKey, done: flat.filter((f) => f.dto.status === 'done').length, total: flat.length }
}

async function findNode(key: string) {
  const units = await buildUnits()
  const { flat } = withStatus(units, await progressMap())
  const i = flat.findIndex((f) => f.node.key === key)
  if (i === -1) throw Errors.notFound('Esa lección')
  if (flat[i]!.dto.status === 'locked') throw new AppError(403, 'LOCKED', 'Esa lección todavía está bloqueada. Termina las anteriores.')
  const unit = units.find((u) => u.nodes.some((n) => n.key === key))!
  const next = flat.slice(i + 1).find((f) => f.unitId === unit.sourceId && f.dto.status !== 'done')?.node.key ?? null
  return { ...flat[i]!, unit, next }
}

const toCard = (q: BankQuestion): StudyCardDTO => ({
  id: q.id,
  sourceId: q.sourceId,
  type: q.type,
  topic: q.topic,
  difficulty: q.difficulty as Difficulty,
  prompt: q.prompt,
  data: q.data,
  explanation: q.explanation,
  sourceQuote: q.sourceQuote,
  sourceLocation: q.sourceLocation,
})

export async function getLesson(key: string): Promise<PathLessonDTO> {
  const { node, unit } = await findNode(key)
  if (node.kind === 'chest') throw new AppError(400, 'IS_CHEST', 'Eso es un cofre, se abre desde el mapa.')
  return { key, label: node.label, unitTitle: unit.title, color: unit.color, kind: node.kind, cards: node.questions, section: node.section ?? null }
}

export const starsFor = (firstTry: number, total: number) => {
  const r = firstTry / total
  return r >= 0.9 ? 3 : r >= 0.7 ? 2 : 1
}

export async function completeLesson(key: string, firstTry: number, total: number) {
  const { node, next } = await findNode(key)
  if (node.kind === 'chest') throw new AppError(400, 'IS_CHEST', 'Eso es un cofre.')
  const stars = starsFor(Math.min(firstTry, total), total)
  const mine = and(eq(pathProgress.profile, currentProfile()), eq(pathProgress.nodeKey, key))
  const [prev] = await db.select().from(pathProgress).where(mine)
  // huesitos solo la primera vez o si mejora estrellas; XP siempre (repasar también cuenta)
  const improved = !prev ? stars : Math.max(0, stars - prev.stars)
  const xp = 5 * total + 10 * stars + (node.kind === 'boss' ? 30 : 0)
  const bones = (prev ? 0 : 3 + (node.kind === 'boss' ? 10 : 0)) + 2 * improved
  if (prev)
    await db
      .update(pathProgress)
      .set({ stars: Math.max(prev.stars, stars), attempts: prev.attempts + 1 })
      .where(mine)
  else await db.insert(pathProgress).values({ profile: currentProfile(), nodeKey: key, stars })
  const r = await recordActivity({ xp, bones })
  return { stars, xp: r.xp, bones: r.bones, streak: r.streak, nextKey: prev ? null : next }
}

export async function openChest(key: string) {
  const { node, next, dto } = await findNode(key)
  if (node.kind !== 'chest') throw new AppError(400, 'NOT_CHEST', 'Eso no es un cofre.')
  if (dto.status === 'done') throw new AppError(409, 'ALREADY_OPEN', 'Ese cofre ya lo abriste.')
  await db.insert(pathProgress).values({ profile: currentProfile(), nodeKey: key, stars: 3 })
  const r = await recordActivity({ xp: isOwner() ? 20 : 50, bones: CHEST_BONES })
  return { bones: r.bones, xp: r.xp, nextKey: next }
}
