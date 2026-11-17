// Selección de preguntas para un examen. Funciones puras (sin BD ni IA) para poder probarlas a fondo.
import type { Difficulty, ExamLevel, QuestionType } from '@vetquiz/shared'

/** Mezcla de dificultades por nivel elegido en la UI */
export const LEVEL_MIX: Record<ExamLevel, Partial<Record<Difficulty, number>>> = {
  // Fácil es solo nivel 1: con un 30 % de nivel 2 se sentía difícil (se usan otros niveles solo si faltan)
  easy: { 1: 1 },
  medium: { 1: 0.2, 2: 0.6, 3: 0.2 },
  hard: { 2: 0.2, 3: 0.6, 4: 0.2 },
  utp: { 4: 0.7, 3: 0.3 },
}

export interface Candidate {
  id: string
  sourceId?: string
  type: QuestionType
  difficulty: Difficulty
  topic: string
  conceptKeys?: string[]
  conceptTimesSeen?: number
  timesSeen: number
  /** Crédito la última vez que salió (null si nunca salió o quedó sin corregir) */
  lastCredit: number | null
  /** ms epoch de la última vez que salió */
  lastSeenAt: number | null
  /** true si se generó con reglas viejas del prompt: va al final de la fila */
  outdated?: boolean
}

export const candidateTopicKey = (c: { sourceId?: string; topic: string }) => `${c.sourceId ?? ''}:${c.topic.trim().toLowerCase()}`

export type Rng = () => number

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Reparte `total` entre claves según pesos, sin perder unidades por redondeo (método del mayor residuo). */
export function largestRemainder<K extends string | number>(total: number, weights: Partial<Record<K, number>>): Map<K, number> {
  const entries = Object.entries(weights) as [string, number][]
  const sum = entries.reduce((s, [, w]) => s + w, 0)
  const raw = entries.map(([k, w]) => ({ k, exact: (total * w) / sum }))
  const out = raw.map((r) => ({ ...r, n: Math.floor(r.exact) }))
  let left = total - out.reduce((s, r) => s + r.n, 0)
  for (const r of [...out].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)))) {
    if (left-- <= 0) break
    r.n++
  }
  const parse = (k: string) => (Number.isNaN(Number(k)) ? k : Number(k)) as K
  return new Map(out.map((r) => [parse(r.k), r.n]))
}

/**
 * Prioridad: primero las que nunca han salido, luego las que falló la última vez, luego las que acertó.
 * Dentro de cada grupo, las que hace más tiempo no ve. Las generadas con reglas viejas van después de todas.
 */
function rank(c: Candidate): [number, number] {
  const bucket = (c.outdated ? 3 : 0) + (c.timesSeen === 0 ? 0 : c.lastCredit !== null && c.lastCredit < 1 ? 1 : 2)
  return [bucket, c.lastSeenAt ?? 0]
}
const byPriority = (a: Candidate, b: Candidate) => {
  const [ba, ta] = rank(a)
  const [bb, tb] = rank(b)
  return ba - bb || ta - tb
}

export interface SelectionResult {
  missingTopics: string[]
  missingConcepts: string[]
  picked: Candidate[]
  /** Preguntas que faltaron en las dificultades objetivo (antes de rellenar con niveles vecinos) */
  missingByDifficulty: Partial<Record<Difficulty, number>>
  /** Cuántas menos de las pedidas trae el examen (el banco no alcanzó ni con vecinos) */
  shortBy: number
  /** Cuántas de las elegidas nunca habían salido */
  unseen: number
}

export function selectQuestions(
  candidates: Candidate[],
  opts: { level: ExamLevel; types: QuestionType[]; count: number; requiredTopics?: string[]; requiredConcepts?: string[]; uniqueConcepts?: boolean },
  rng: Rng = Math.random,
): SelectionResult {
  const types = [...new Set(opts.types)]
  const pool = candidates.filter((c) => types.includes(c.type))
  const remaining = shuffle(pool, rng)
  const topicKey = candidateTopicKey
  const topicSeen = new Map<string, number>()
  const topicPicked = new Map<string, number>()
  const conceptPicked = new Set<string>()
  for (const c of pool) topicSeen.set(topicKey(c), (topicSeen.get(topicKey(c)) ?? 0) + c.timesSeen)

  const typeQuota = largestRemainder(opts.count, Object.fromEntries(types.map((t) => [t, 1])) as Record<QuestionType, number>)
  const diffTargets = largestRemainder<Difficulty>(opts.count, LEVEL_MIX[opts.level])
  const picked: Candidate[] = []
  const missing: Partial<Record<Difficulty, number>> = {}

  const pick = (best: Candidate) => {
    remaining.splice(remaining.indexOf(best), 1)
    picked.push(best)
    topicPicked.set(topicKey(best), (topicPicked.get(topicKey(best)) ?? 0) + 1)
    for (const key of best.conceptKeys ?? []) conceptPicked.add(key)
    typeQuota.set(best.type, typeQuota.get(best.type)! - 1)
  }
  const repeatedConcept = (c: Candidate) => c.conceptKeys?.length && c.conceptKeys.every(k => conceptPicked.has(k)) ? 1 : 0
  const novelty = (a: Candidate, b: Candidate) => repeatedConcept(a) - repeatedConcept(b) ||
    (a.conceptTimesSeen ?? 0) - (b.conceptTimesSeen ?? 0) ||
    typeQuota.get(b.type)! - typeQuota.get(a.type)! || byPriority(a, b)

  // Primero la cobertura obligatoria; la dificultad nunca puede borrar una sección.
  const missingTopics = new Set(opts.requiredTopics ?? [])
  const missingConcepts = new Set(opts.requiredConcepts ?? [])
  const coverage = (c: Candidate) => Number(missingTopics.has(topicKey(c))) + (c.conceptKeys ?? []).filter(k => missingConcepts.has(k)).length
  while ((missingTopics.size || missingConcepts.size) && picked.length < opts.count) {
    const options = remaining.filter(c => coverage(c) > 0)
    if (!options.length) break
    const deficit = (c: Candidate) => (diffTargets.get(c.difficulty) ?? 0) - picked.filter(p => p.difficulty === c.difficulty).length
    options.sort((a, b) => coverage(b) - coverage(a) || deficit(b) - deficit(a) || novelty(a, b))
    const best = options[0]!
    pick(best)
    missingTopics.delete(topicKey(best))
    for (const key of best.conceptKeys ?? []) missingConcepts.delete(key)
  }

  const takeFrom = (d: Difficulty): boolean => {
    if (picked.length >= opts.count) return false
    const options = remaining.filter(c => c.difficulty === d && (!opts.uniqueConcepts || !repeatedConcept(c)))
    if (!options.length) return false
    options.sort((a, b) =>
      (topicPicked.get(topicKey(a)) ?? 0) - (topicPicked.get(topicKey(b)) ?? 0) ||
      repeatedConcept(a) - repeatedConcept(b) ||
      (topicSeen.get(topicKey(a)) ?? 0) - (topicSeen.get(topicKey(b)) ?? 0) || novelty(a, b))
    pick(options[0]!)
    return true
  }

  // 1) dificultades objetivo (la de mayor peso primero)
  for (const [d, target] of [...diffTargets].sort((a, b) => b[1] - a[1])) {
    const needed = Math.max(0, target - picked.filter(p => p.difficulty === d).length)
    for (let k = 0; k < needed && picked.length < opts.count; k++) if (!takeFrom(d)) missing[d] = (missing[d] ?? 0) + 1
  }

  // 2) lo que faltó se rellena con la dificultad más cercana (primero la de abajo: es más justo)
  for (const [d, n] of Object.entries(missing).map(([d, n]) => [Number(d) as Difficulty, n!] as const)) {
    let left = n
    for (let dist = 1; dist <= 3 && left > 0; dist++) {
      for (const nd of [d - dist, d + dist]) {
        while (left > 0 && nd >= 1 && nd <= 4 && takeFrom(nd as Difficulty)) left--
      }
    }
  }

  return {
    missingTopics: [...missingTopics],
    missingConcepts: [...missingConcepts],
    picked,
    missingByDifficulty: missing,
    shortBy: opts.count - picked.length,
    unseen: picked.filter((p) => p.timesSeen === 0).length,
  }
}

/**
 * Orden final: dificultad ascendente pero intercalando temas, para que no salgan
 * 5 seguidas de "Cronometría dentaria".
 */
export function orderForExam<T extends { topic: string; difficulty: number }>(items: T[], rng: Rng = Math.random): T[] {
  const byTopic = new Map<string, T[]>()
  for (const it of shuffle(items, rng).sort((a, b) => a.difficulty - b.difficulty)) {
    byTopic.set(it.topic, [...(byTopic.get(it.topic) ?? []), it])
  }
  const queues = shuffle([...byTopic.values()], rng)
  const out: T[] = []
  while (out.length < items.length) {
    // en cada ronda, primero el tema cuya siguiente pregunta es más fácil
    queues.sort((a, b) => (a[0]?.difficulty ?? 9) - (b[0]?.difficulty ?? 9))
    for (const q of queues) if (q.length) out.push(q.shift()!)
  }
  return out
}

/** Permutación aleatoria; para emparejar nunca deja la columna derecha en el orden correcto. */
export function displayPermutation(n: number, rng: Rng = Math.random, avoidIdentity = false): number[] {
  const base = Array.from({ length: n }, (_, i) => i)
  for (let tries = 0; tries < 20; tries++) {
    const p = shuffle(base, rng)
    if (!avoidIdentity || n < 2 || p.some((v, i) => v !== i)) return p
  }
  return [...base.slice(1), 0]
}
