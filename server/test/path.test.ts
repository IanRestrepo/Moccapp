// Camino tipo Duolingo: reparto de preguntas en lecciones y estrellas.
import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'

const { splitIntoNodes, starsFor, guideNodes } = await import('../src/services/path.js')
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


test('lecciones y jefe descartan preguntas externas, antiguas y de otra sección', async () => {
  const { guideFingerprint } = await import('../src/services/guide-grounding.js')
  const sections = ['Citrato', 'ACP'].map(title => ({
    title, location: '', summary: `El transporte corresponde a ${title}.`, keyPoints: [],
    terms: [], tables: [], tip: '', bankTopics: [title], images: [],
  }))
  const guide = { version: 2, overview: '', sections, conceptMap: { center: 'Transporte', branches: [] }, checklist: [] }
  const hash = guideFingerprint(guide)
  const grounded = (i: number, topic = 'Citrato') => ({
    ...q(i, 3), sourceId: 's', type: 'multiple_choice', topic,
    prompt: '¿A qué corresponde el transporte?',
    data: { type: 'multiple_choice', options: [topic, 'B', 'C', 'D'], correctIndex: 0, distractorRationales: [] },
    explanation: '', sourceQuote: `El transporte corresponde a ${topic}.`, sourceLocation: null, guideHash: hash,
  }) as Q
  const questions = [
    ...Array.from({ length: 4 }, (_, i) => grounded(i)),
    { ...grounded(4), guideHash: null },
    { ...grounded(5), guideHash: 'guía anterior' },
    { ...grounded(6), sourceQuote: 'Detalle ausente en la guía.' },
    { ...grounded(7, 'ACP'), topic: 'Citrato' },
  ]
  const nodes = guideNodes('s', guide, questions)
  assert.equal(nodes[0]!.questions.length, 1) // cuatro paráfrasis del mismo concepto cuentan una sola vez
  assert.ok(nodes[0]!.questions.every(c => !['q4', 'q5', 'q6', 'q7'].includes(c.id)))
  assert.equal(nodes[1]!.questions.length, 0) // sin fabricar preguntas a partir del resumen
  const boss = nodes.find(n => n.kind === 'boss')!
  assert.ok(boss.questions.length >= 4)
  assert.ok(boss.questions.every(c => !['q4', 'q5', 'q6'].includes(c.id)))
  assert.equal(nodes.at(-1)!.kind, 'chest')
})
