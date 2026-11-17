// Camino tipo Duolingo: cada fuente es una unidad y la recorre COMPLETA, sección por sección de su guía de estudio:
// en cada lección primero lee la sección y luego practica con preguntas de esa sección (del banco y de sus términos).
// Al final, un jefe y un cofre. Mientras la guía se prepara, la unidad usa las lecciones por dificultad de antes.
// Sin IA aquí. Las abiertas quedan fuera: esas las corrige Gemini.
import { and, asc, eq, inArray } from 'drizzle-orm'
import type {
  Difficulty,
  GuideSection,
  GuideTopicQuizDTO,
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
import { pathProgress, questionBank, sources, exams, examAnswers, type BankQuestion } from '../db/schema.js'
import { AppError, Errors } from '../lib/errors.js'
import { currentProfile, isOwner, visibleOwners } from '../lib/profile.js'
import { expandChapterOnce } from './bank.js'
import { conceptKeys, literalGuideQuestions } from './guide-concepts.js'
import { emptyHistory, questionHistory, type QuestionHistory } from './question-history.js'
import { toQuestionData } from '../ai/schemas.js'
import { shuffle, selectQuestions, candidateTopicKey } from './exams/selection.js'
import { startChapterExam } from './chapter-exams.js'
import { recordActivity } from './gamification.js'
import { guideFingerprint, supportedBySections } from './guide-grounding.js'
import { guideStatus, guidesFor } from './guide.js'

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
  studyGuide?: StudyGuide
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

/** Mismo respaldo pedagógico que el banco: definiciones válidas y distractores del capítulo. */
export function termCards(sourceId: string, sectionIndex: number, guide: StudyGuide, max = 4): StudyCardDTO[] {
  const section = guide.sections[sectionIndex]!
  return literalGuideQuestions({ ...guide, sections: [section] }).filter(q => q.type === 'multiple_choice').slice(0, max).map((q, i) => ({
    id: `${sourceId}:s${sectionIndex}:t${i}`, sourceId, type: q.type, topic: q.topic, difficulty: 1,
    prompt: q.prompt, data: toQuestionData(q), explanation: q.explanation, sourceQuote: q.sourceQuote, sourceLocation: q.sourceLocation,
  }))
}

const SECTION_MAX = 9

/** Un concepto por ejercicio; rota por exposiciones de lecciones y exámenes del perfil. */
export function rotateLessonCards(cards: StudyCardDTO[], guide: StudyGuide, history: QuestionHistory, max = SECTION_MAX): StudyCardDTO[] {
  const keys = new Map(cards.map(q => [q.id, conceptKeys(q.sourceId, q, guide)]))
  const seenConcepts = (q: StudyCardDTO) => Math.min(...keys.get(q.id)!.map(k => history.concepts.get(k)?.times ?? 0))
  const lastConcept = (q: StudyCardDTO) => Math.min(...keys.get(q.id)!.map(k => history.concepts.get(k)?.lastAt ?? 0))
  const pool = shuffle(cards).sort((a, b) => seenConcepts(a) - seenConcepts(b) || lastConcept(a) - lastConcept(b) ||
    (history.questions.get(a.id)?.times ?? 0) - (history.questions.get(b.id)?.times ?? 0) || a.difficulty - b.difficulty)
  const picked: StudyCardDTO[] = []
  const covered = new Set<string>()
  for (const card of pool) {
    if (picked.length >= max) break
    if (keys.get(card.id)!.every(k => covered.has(k))) continue
    picked.push(card)
    keys.get(card.id)!.forEach(k => covered.add(k))
  }
  return picked
}

/** Unidad desde la guía: una lección por sección (leer + practicar), jefe con lo más difícil y cofre */
export function guideNodes(sourceId: string, guide: StudyGuide, questions: BankQuestion[], history: QuestionHistory = emptyHistory()): Node[] {
  const used = new Set<string>()
  const fingerprint = guideFingerprint(guide)
  const literal = literalGuideQuestions(guide).filter(q => q.type !== 'short_answer').map((q, index): StudyCardDTO => ({
    id: `${sourceId}:g${fingerprint.slice(0, 12)}:c${index}`, sourceId, type: q.type, topic: q.topic,
    difficulty: 1, prompt: q.prompt, data: toQuestionData(q), explanation: q.explanation,
    sourceQuote: q.sourceQuote, sourceLocation: q.sourceLocation,
  }))
  const nodes: Node[] = guide.sections.map((section, i) => {
    const topics = new Set(section.bankTopics.map(norm))
    const fromBank = questions
      .filter((q) => q.type !== 'short_answer' && !used.has(q.id) && (topics.has(norm(q.topic)) || norm(q.topic) === norm(section.title)) && supportedBySections(q, [section], fingerprint))
      .sort((a, b) => a.difficulty - b.difficulty)
    const terms = termCards(sourceId, i, guide, section.terms.length)
    const cards = rotateLessonCards([...terms, ...fromBank.map(toCard), ...literal.filter(q => q.topic === section.title)], guide, history, SECTION_MAX)
    cards.forEach(q => used.add(q.id))
    return { key: `${sourceId}:s${i}`, kind: 'lesson' as const, label: section.title, section, questions: cards }
  })
  // El jefe rota temas y conceptos usando el mismo historial que las lecciones.
  const hard = questions.filter(q => q.type !== 'short_answer' && q.difficulty >= 3 && supportedBySections(q, guide.sections, fingerprint))
  if (hard.length >= MIN_LESSON) {
    const topics = [...new Set(hard.map(q => candidateTopicKey(q)))]
    const candidates = hard.map(q => {
      const seen = history.questions.get(q.id)
      const keys = conceptKeys(sourceId, q, guide)
      return { ...q, conceptKeys: keys, conceptTimesSeen: Math.min(...keys.map(k => history.concepts.get(k)?.times ?? 0)),
        timesSeen: seen?.times ?? 0, lastCredit: seen?.credit ?? null, lastSeenAt: seen?.lastAt ?? null }
    })
    const chosen = selectQuestions(candidates, { level: 'hard', types: ['multiple_choice', 'true_false', 'matching'], count: Math.max(10, topics.length), requiredTopics: topics })
    const ids = new Set(chosen.picked.map(q => q.id))
    nodes.push({ key: `${sourceId}:boss`, kind: 'boss', label: 'Jefe de la unidad', questions: hard.filter(q => ids.has(q.id)).map(toCard) })
  }
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
  const history = await questionHistory(qs, new Map([...guides].flatMap(([id, row]) => row.data ? [[id, row.data] as const] : [])))
  return srcs
    .sort((a, b) => leadingNumber(a.originalName) - leadingNumber(b.originalName))
    .map((s) => {
      const row = guides.get(s.id)
      const guide = guideStatus(row)
      const questions = bySource.get(s.id) ?? []
      const nodes = guide === 'ready' && row?.data?.sections.length ? guideNodes(s.id, row.data, questions, history) : splitIntoNodes(s.id, questions)
      return { sourceId: s.id, title: s.title, color: s.color, guide, studyGuide: row?.data ?? undefined, nodes }
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

export async function getPath(): Promise<PathDTO> {
  const units = await buildUnits()
  const { dtoUnits, currentKey, flat } = withStatus(units, await progressMap())
  return { units: dtoUnits, currentKey, done: flat.filter((f) => f.dto.status === 'done').length, total: flat.length }
}

async function findNode(key: string, ignoreLock = false) {
  const units = await buildUnits()
  const { flat } = withStatus(units, await progressMap())
  const i = flat.findIndex((f) => f.node.key === key)
  if (i === -1) throw Errors.notFound('Esa lección')
  if (flat[i]!.dto.status === 'locked' && !ignoreLock) throw new AppError(403, 'LOCKED', 'Esa lección todavía está bloqueada. Termina las anteriores.')
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
  let found = await findNode(key)
  if (!found.node.questions.length && found.node.section) {
    await expandChapterOnce(found.unit.sourceId, Number(key.split(':s')[1]))
    found = await findNode(key)
  }
  const { node, unit } = found
  if (node.kind === 'chest') throw new AppError(400, 'IS_CHEST', 'Eso es un cofre, se abre desde el mapa.')
  const attempt = await startChapterExam(unit.sourceId, key, node.label, node.questions, unit.studyGuide ? guideFingerprint(unit.studyGuide) : undefined)
  return { examId: attempt.examId, key, label: node.label, unitTitle: unit.title, color: unit.color, kind: node.kind, cards: attempt.cards, section: node.section ?? null }
}

export const starsFor = (firstTry: number, total: number) => {
  const r = firstTry / total
  return r >= 0.9 ? 3 : r >= 0.7 ? 2 : 1
}

export async function completeLesson(key: string, firstTry: number, total: number, fromGuide = false, examId?: string) {
  // desde la guía puede hacer los temas en cualquier orden
  const { node, next } = await findNode(key, fromGuide && !!key.match(/:s\d+$/))
  if (node.kind === 'chest') throw new AppError(400, 'IS_CHEST', 'Eso es un cofre.')
  if (examId) {
    const [attempt] = await db.select().from(exams).where(and(eq(exams.id, examId), eq(exams.profile, currentProfile()), eq(exams.chapterKey, key)))
    if (!attempt || attempt.status !== 'completed') throw Errors.conflict('EXAM_NOT_DONE', 'Primero envía el miniexamen para guardar su resultado.')
    const answers = await db.select().from(examAnswers).where(eq(examAnswers.examId, examId))
    total = answers.length
    firstTry = answers.filter(a => a.credit === 1).length
  }
  const stars = starsFor(Math.min(firstTry, total), total)
  const mine = and(eq(pathProgress.profile, currentProfile()), eq(pathProgress.nodeKey, key))
  const [prev] = await db.select().from(pathProgress).where(mine)
  // huesitos solo la primera vez o si mejora estrellas; XP siempre (repasar también cuenta)
  const improved = !prev ? stars : Math.max(0, stars - prev.stars)
  const xp = examId ? 0 : 5 * total + 10 * stars + (node.kind === 'boss' ? 30 : 0)
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

/** Mini examen de un tema de la guía: las mismas preguntas de la lección de esa sección en el camino */
export async function guideTopicQuiz(sourceId: string, index: number): Promise<GuideTopicQuizDTO> {
  let units = await buildUnits()
  let unit = units.find((u) => u.sourceId === sourceId)
  let node = unit?.nodes.find((n) => n.key === `${sourceId}:s${index}`)
  if (!unit || !node?.section) throw Errors.notFound('Ese tema')
  if (!node.questions.length) {
    await expandChapterOnce(sourceId, index)
    units = await buildUnits()
    unit = units.find(u => u.sourceId === sourceId)
    node = unit?.nodes.find(n => n.key === `${sourceId}:s${index}`)
    if (!unit || !node?.section) throw Errors.notFound('Ese tema')
  }
  const attempt = await startChapterExam(sourceId, node.key, node.label, node.questions, unit.studyGuide ? guideFingerprint(unit.studyGuide) : undefined)
  return {
    examId: attempt.examId,
    sourceId,
    index,
    title: node.section.title,
    topicCount: unit.nodes.filter((n) => n.section).length,
    pathKey: node.key,
    color: unit.color,
    cards: attempt.cards,
  }
}
