import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as sel from '../src/services/exams/selection.js'
const TYPES = ['multiple_choice', 'true_false', 'matching', 'short_answer'] as const

describe('selección (pura)', () => {
  const cand = (id: string, difficulty: 1 | 2 | 3 | 4, extra: Partial<import('../src/services/exams/selection.js').Candidate> = {}) => ({
    id,
    type: 'multiple_choice' as const,
    difficulty,
    topic: 't',
    timesSeen: 0,
    lastCredit: null,
    lastSeenAt: null,
    ...extra,
  })

  test('un banco desbalanceado no monopoliza el examen y rota temas entre intentos', () => {
    const pool = ['A', 'B', 'C'].flatMap((topic, i) => Array.from({ length: i ? 3 : 100 }, (_, k) => cand(`${topic}${k}`, 1, { topic })))
    const first = sel.selectQuestions(pool, { level: 'easy', types: ['multiple_choice'], count: 6 }, () => 0.5)
    for (const topic of ['A', 'B', 'C']) assert.equal(first.picked.filter(q => q.topic === topic).length, 2)
    const next = sel.selectQuestions(pool.map(q => ({ ...q, timesSeen: q.topic === 'A' ? 1 : 0 })), { level: 'easy', types: ['multiple_choice'], count: 2 })
    assert.deepEqual(new Set(next.picked.map(q => q.topic)), new Set(['B', 'C']))
  })

  test('reparto por mayor residuo suma exacto', () => {
    assert.deepEqual(Object.fromEntries(sel.largestRemainder(20, sel.LEVEL_MIX.utp)), { 3: 6, 4: 14 })
    assert.deepEqual([...sel.largestRemainder(7, sel.LEVEL_MIX.medium)].reduce((s, [, n]) => s + n, 0), 7)
  })

  test('prioridad: nunca vistas → falladas → acertadas (las más antiguas primero)', () => {
    const pool = [
      cand('acertada', 1, { timesSeen: 1, lastCredit: 1, lastSeenAt: 1 }),
      cand('fallada-reciente', 1, { timesSeen: 1, lastCredit: 0, lastSeenAt: 200 }),
      cand('fallada-vieja', 1, { timesSeen: 2, lastCredit: 0.5, lastSeenAt: 100 }),
      cand('nueva', 1),
    ]
    const r = sel.selectQuestions(pool, { level: 'easy', types: ['multiple_choice'], count: 3 })
    assert.deepEqual(r.picked.map((p) => p.id), ['nueva', 'fallada-vieja', 'fallada-reciente'])
    assert.deepEqual(r.missingByDifficulty, {})
    assert.equal(r.shortBy, 0)
    assert.equal(r.unseen, 1)
  })

  test('Fácil es solo nivel 1; si no alcanza, rellena con nivel 2 y lo reporta', () => {
    const pool = [...Array.from({ length: 6 }, (_, k) => cand(`n1-${k}`, 1)), ...Array.from({ length: 6 }, (_, k) => cand(`n2-${k}`, 2))]
    const full = sel.selectQuestions(pool, { level: 'easy', types: ['multiple_choice'], count: 6 })
    assert.ok(full.picked.every((p) => p.difficulty === 1))
    const short = sel.selectQuestions(pool, { level: 'easy', types: ['multiple_choice'], count: 8 })
    assert.equal(short.picked.filter((p) => p.difficulty === 2).length, 2)
    assert.deepEqual(short.missingByDifficulty, { 1: 2 })
  })

  test('las preguntas generadas con reglas viejas van después de todas, aunque nunca hayan salido', () => {
    const pool = [
      cand('vieja-nunca-vista', 1, { outdated: true }),
      cand('nueva-acertada', 1, { timesSeen: 3, lastCredit: 1, lastSeenAt: 5 }),
      cand('nueva-nunca-vista', 1),
    ]
    const r = sel.selectQuestions(pool, { level: 'easy', types: ['multiple_choice'], count: 3 })
    assert.deepEqual(r.picked.map((p) => p.id), ['nueva-nunca-vista', 'nueva-acertada', 'vieja-nunca-vista'])
  })

  test('el prompt trae las reglas de Fácil (un solo dato, sin trampas de "al revés")', async () => {
    const { BANK_SYSTEM_PROMPT, BANK_PROMPT_VERSION } = await import('../src/ai/prompts.js')
    assert.equal(BANK_PROMPT_VERSION, 2)
    assert.match(BANK_SYSTEM_PROMPT, /UN solo dato central/)
    assert.match(BANK_SYSTEM_PROMPT, /maxilar\/mandibular/)
    assert.match(BANK_SYSTEM_PROMPT, /nunca listas de 2 o más/)
  })

  test('reparte los tipos de forma pareja y reporta lo que no alcanzó', () => {
    const pool = TYPES.flatMap((t) => Array.from({ length: 5 }, (_, k) => ({ ...cand(`${t}${k}`, 2), type: t })))
    const r = sel.selectQuestions(pool, { level: 'medium', types: ['multiple_choice', 'true_false', 'matching'], count: 12 })
    const byType = Object.groupBy(r.picked, (p) => p.type)
    assert.deepEqual(Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v!.length])), { multiple_choice: 4, true_false: 4, matching: 4 })
    const short = sel.selectQuestions(pool, { level: 'medium', types: ['matching'], count: 8 })
    assert.equal(short.picked.length, 5)
    assert.equal(short.shortBy, 3)
  })

  test('orden: intercala temas y va de fácil a difícil', () => {
    const items = ['A', 'B', 'C'].flatMap((topic) => [1, 2, 3, 4].map((difficulty) => ({ topic, difficulty })))
    const ordered = sel.orderForExam(items)
    for (let i = 1; i < ordered.length; i++) assert.notEqual(ordered[i]!.topic, ordered[i - 1]!.topic, `temas seguidos en ${i}`)
    assert.equal(ordered[0]!.difficulty, 1)
    assert.equal(ordered.at(-1)!.difficulty, 4)
  })

  test('emparejar nunca queda con la columna derecha en orden correcto', () => {
    for (let k = 0; k < 200; k++) {
      const p = sel.displayPermutation(3, Math.random, true)
      assert.notDeepEqual(p, [0, 1, 2])
    }
  })
})



test('temas con el mismo nombre en fuentes distintas tienen cuotas independientes', () => {
  const pool = ['s1', 's2'].flatMap(sourceId => Array.from({ length: sourceId === 's1' ? 100 : 3 }, (_, i) => ({
    id: `${sourceId}-${i}`, sourceId, type: 'multiple_choice' as const, difficulty: 1 as const,
    topic: 'Transporte', timesSeen: 0, lastCredit: null, lastSeenAt: null,
  })))
  const result = sel.selectQuestions(pool, { level: 'easy', types: ['multiple_choice'], count: 6 })
  assert.equal(result.picked.filter(q => q.sourceId === 's1').length, 3)
  assert.equal(result.picked.filter(q => q.sourceId === 's2').length, 3)
  assert.equal(new Set(result.picked.map(q => q.id)).size, 6)
})
