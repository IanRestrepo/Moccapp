// Camino tipo Duolingo: reparto de preguntas en lecciones y estrellas.
import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'

const { splitIntoNodes, starsFor } = await import('../src/services/path.js')
type Q = Parameters<typeof splitIntoNodes>[1][number]

const q = (i: number, difficulty: number) => ({ id: `q${i}`, difficulty }) as unknown as Q
const bank = (counts: Record<number, number>) => {
  let i = 0
  return Object.entries(counts).flatMap(([d, n]) => Array.from({ length: n }, () => q(i++, Number(d))))
}

test('banco completo: 5 lecciones + jefe + cofre, de fácil a difícil, sin repetir preguntas', () => {
  const nodes = splitIntoNodes('s', bank({ 1: 16, 2: 16, 3: 12, 4: 10 }))
  assert.deepEqual(nodes.map((n) => n.kind), ['lesson', 'lesson', 'lesson', 'lesson', 'lesson', 'boss', 'chest'])
  assert.ok(nodes[0]!.questions.every((x) => x.difficulty === 1))
  assert.ok(nodes[2]!.questions.every((x) => x.difficulty === 2))
  assert.ok(nodes[5]!.questions.every((x) => x.difficulty === 4))
  const ids = nodes.flatMap((n) => n.questions.map((x) => x.id))
  assert.equal(new Set(ids).size, ids.length)
})

test('banco pequeño: omite lecciones sin mínimo y rellena con el nivel más cercano', () => {
  const nodes = splitIntoNodes('s', bank({ 1: 5, 2: 5, 3: 3, 4: 3 }))
  assert.ok(nodes.every((n) => n.kind === 'chest' || n.questions.length >= 4))
  assert.equal(nodes.at(-1)!.kind, 'chest')
  assert.deepEqual(splitIntoNodes('s', bank({ 1: 2 })), [])
})

test('estrellas: ≥90 % a la primera 3, ≥70 % 2, si no 1', () => {
  assert.equal(starsFor(8, 8), 3)
  assert.equal(starsFor(6, 8), 2)
  assert.equal(starsFor(2, 8), 1)
})
