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
  type: QuestionType
  difficulty: Difficulty
  topic: string
  timesSeen: number
  /** Crédito la última vez que salió (null si nunca salió o quedó sin corregir) */
  lastCredit: number | null
  /** ms epoch de la última vez que salió */
  lastSeenAt: number | null
  /** true si se generó con reglas viejas del prompt: va al final de la fila */
  outdated?: boolean
}

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
  opts: { level: ExamLevel; types: QuestionType[]; count: number },
  rng: Rng = Math.random,
): SelectionResult {
  const types = [...new Set(opts.types)]
  const pool = candidates.filter((c) => types.includes(c.type))
  // barajar antes de ordenar: los empates salen en orden distinto en cada examen
  const buckets = new Map<string, Candidate[]>()
  for (const c of shuffle(pool, rng).sort(byPriority)) {
    const key = `${c.difficulty}:${c.type}`
    buckets.set(key, [...(buckets.get(key) ?? []), c])
  }

  const typeQuota = largestRemainder(opts.count, Object.fromEntries(types.map((t) => [t, 1])) as Record<QuestionType, number>)
  const diffTargets = largestRemainder<Difficulty>(opts.count, LEVEL_MIX[opts.level])
  const picked: Candidate[] = []
  const missing: Partial<Record<Difficulty, number>> = {}

  /** Toma de la dificultad `d` la pregunta del tipo al que más cuota le falte */
  const takeFrom = (d: Difficulty): boolean => {
    const options = types.filter((t) => buckets.get(`${d}:${t}`)?.length)
    if (!options.length) return false
    const maxQuota = Math.max(...options.map((t) => typeQuota.get(t)!))
    const best = shuffle(options.filter((t) => typeQuota.get(t) === maxQuota), rng)[0]!
    picked.push(buckets.get(`${d}:${best}`)!.shift()!)
    typeQuota.set(best, typeQuota.get(best)! - 1)
    return true
  }

  // 1) dificultades objetivo (la de mayor peso primero)
  for (const [d, target] of [...diffTargets].sort((a, b) => b[1] - a[1])) {
    for (let k = 0; k < target; k++) if (!takeFrom(d)) missing[d] = (missing[d] ?? 0) + 1
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
