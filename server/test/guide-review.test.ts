import assert from 'node:assert/strict'
import { test } from 'node:test'
process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
const { setLlm } = await import('../src/ai/gemini.js')
const { reviewGuideQuestions, GUIDE_REVIEW_SYSTEM } = await import('../src/services/guide-review.js')
const { literalGuideQuestions } = await import('../src/services/guide-concepts.js')
const guide = { version: 2, overview: '', checklist: [], conceptMap: { center: 'Guía', branches: [] }, sections: [{
  title: 'Transporte', summary: 'El citrato transporta el grupo acetilo.', location: '', keyPoints: [], terms: [], tables: [], tip: '', bankTopics: [], images: [],
}] }

test('revisión independiente recibe enunciado y evidencia; solo admite índices aprobados', async () => {
  const questions = [{ type: 'true_false' as const, difficulty: 1, topic: 'Transporte', prompt: 'El citrato transporta el grupo acetilo.',
    options: ['Verdadero', 'Falso'], correctIndex: 0, explanation: 'El citrato transporta el grupo acetilo.', sourceQuote: 'El citrato transporta el grupo acetilo.',
    sourceLocation: '', distractorRationales: [], matchingPairs: [], expectedAnswer: '', keyPoints: [] }]
  setLlm({ async generateJson(p) {
    assert.equal(p.system, GUIDE_REVIEW_SYSTEM)
    assert.match(p.system, /verdad o falsedad completa/)
    assert.match(p.prompt, /correctIndex/)
    assert.match(p.prompt, /sourceQuote/)
    assert.match(p.source[0]!.text!, /El citrato transporta/)
    return { approved: [999] }
  }, async uploadFile() { throw new Error('no usado') } })
  assert.deepEqual(await reviewGuideQuestions(guide, questions), [])
  setLlm({ async generateJson() { return { approved: [0] } }, async uploadFile() { throw new Error('no usado') } })
  assert.deepEqual(await reviewGuideQuestions(guide, questions), [questions[0]])
})

test('si falla la revisión o su formato, ninguna pregunta de IA pasa sin revisar', async () => {
  setLlm({ async generateJson() { throw new Error('IA caída') }, async uploadFile() { throw new Error('no usado') } })
  assert.deepEqual(await reviewGuideQuestions(guide, literalGuideQuestions(guide)), [])
  setLlm({ async generateJson() { return { approved: ['sí'] } }, async uploadFile() { throw new Error('no usado') } })
  assert.deepEqual(await reviewGuideQuestions(guide, literalGuideQuestions(guide)), [])
})

test('la revisión ve exclusivamente el capítulo y rechaza preguntas sobre el documento', async () => {
  const q = { type: 'true_false' as const, difficulty: 1, topic: 'Transporte', prompt: 'El citrato transporta el grupo acetilo.',
    options: ['Verdadero', 'Falso'], correctIndex: 0, explanation: '', sourceQuote: 'El citrato transporta el grupo acetilo.',
    sourceLocation: '', distractorRationales: [], matchingPairs: [], expectedAnswer: '', keyPoints: [] }
  let calls = 0
  setLlm({ async generateJson(p) {
    calls++
    assert.doesNotMatch(p.source[0]!.text!, /Sección posterior|CONCEPTO_NO_ESTUDIADO/)
    return { approved: [0] }
  }, async uploadFile() { throw new Error('no usado') } })
  const full = { ...guide, sections: [...guide.sections, { ...guide.sections[0]!, title: 'Sección posterior', summary: 'CONCEPTO_NO_ESTUDIADO' }] }
  assert.equal((await reviewGuideQuestions(full, [q])).length, 1)
  assert.deepEqual(await reviewGuideQuestions(full, [{ ...q, prompt: 'Según la guía, es falsa esta afirmación: citrato.' }]), [])
  assert.equal(calls, 1)
})
