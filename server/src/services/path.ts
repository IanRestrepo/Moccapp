// Camino tipo Duolingo: cada fuente es una unidad con lecciones que suben de dificultad y un cofre al final.
// Se arma con las preguntas del banco (sin IA). Las abiertas quedan fuera: esas las corrige Gemini.
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Difficulty, PathDTO, PathLessonDTO, PathNodeDTO, PathNodeKind, PathUnitDTO, SourceColor, StudyCardDTO } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { pathProgress, questionBank, sources, type BankQuestion } from '../db/schema.js'
import { AppError, Errors } from '../lib/errors.js'
import { currentProfile, isOwner, visibleOwners } from '../lib/profile.js'
import { recordActivity } from './gamification.js'

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
  questions: BankQuestion[]
}
interface Unit {
  sourceId: string
  title: string
  color: SourceColor
  nodes: Node[]
}

/** "1.Geopolítica…", "9 Desarrollo…" → 1, 9. Sin número va al final. */
const leadingNumber = (name: string | null) => {
  const m = name?.match(/^\s*(\d{1,3})/)
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY
}

/** Reparte las preguntas de una fuente en lecciones. Estable: el banco crece al final, las lecciones ya hechas no cambian. */
export function splitIntoNodes(sourceId: string, questions: BankQuestion[]): Node[] {
  const pool = new Map<number, BankQuestion[]>([1, 2, 3, 4].map((d) => [d, questions.filter((q) => q.difficulty === d)]))
  const nodes: Node[] = []
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
  return srcs
    .sort((a, b) => leadingNumber(a.originalName) - leadingNumber(b.originalName))
    .map((s) => ({ sourceId: s.id, title: s.title, color: s.color, nodes: splitIntoNodes(s.id, bySource.get(s.id) ?? []) }))
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

export async function getPath(): Promise<PathDTO> {
  const { dtoUnits, currentKey, flat } = withStatus(await buildUnits(), await progressMap())
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
  return { key, label: node.label, unitTitle: unit.title, color: unit.color, kind: node.kind, cards: node.questions.map(toCard) }
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
