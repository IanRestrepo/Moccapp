import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { StudyGuide } from '@vetquiz/shared'
import { guideConcepts, literalGuideQuestions, conceptKeys } from '../src/services/guide-concepts.js'
import { guideFingerprint, supportedBySections } from '../src/services/guide-grounding.js'
import { toQuestionData } from '../src/ai/schemas.js'
import { selectQuestions, candidateTopicKey } from '../src/services/exams/selection.js'

const guide: StudyGuide = {
  version: 2, overview: '', conceptMap: { center: 'Digestión', branches: [] }, checklist: [],
  sections: Array.from({ length: 25 }, (_, i) => ({
    title: `Sección ${i}`, location: '', summary: `El órgano número ${i} participa en la digestión.`,
    keyPoints: [`El órgano ${i} tiene una función específica.`],
    terms: [{ term: `Órgano ${i}`, definition: `Estructura digestiva número ${i}.` }],
    tables: [{ title: 'Funciones', columns: ['Órgano', 'Función'], rows: [[`Órgano ${i}`, `Función ${i}`]] }],
    tip: '', bankTopics: [], images: [],
  })),
}

test('inventario incluye resúmenes, ideas, términos y tablas de todas las secciones', () => {
  const concepts = guideConcepts(guide)
  assert.equal(concepts.length, 100)
  assert.equal(new Set(concepts.map(c => c.id)).size, 100)
  assert.equal(new Set(concepts.map(c => c.section)).size, 25)
})

test('el respaldo solo evalúa definiciones completas, sin fabricar V/F', () => {
  const covered = new Set<string>()
  const questions = literalGuideQuestions(guide)
  assert.ok(questions.length > 0)
  assert.ok(questions.every(q => q.type !== 'true_false'))
  assert.ok(questions.every(q => !/según|fragmento|es falsa|completa con/i.test(q.prompt)))
  for (const q of questions) {
    const question = { ...q, data: toQuestionData(q), guideHash: guideFingerprint(guide) }
    const section = guide.sections.find(s => s.title === q.topic)!
    assert.equal(supportedBySections(question, [section], guideFingerprint(guide)), true, q.prompt)
    conceptKeys('s', question, guide).forEach(k => covered.add(k))
  }
  for (const concept of guideConcepts(guide).filter(c => c.term)) assert.ok(covered.has(`s:${concept.id}`))
})

test('el examen completo cubre más de 20 secciones y cada concepto sin duplicarlo', () => {
  const candidates = guideConcepts(guide).map((c, i) => ({
    id: String(i), sourceId: 's', topic: guide.sections[c.section]!.title, type: 'short_answer' as const, difficulty: 1 as const,
    timesSeen: 0, lastCredit: null, lastSeenAt: null, conceptKeys: [`s:${c.id}`],
  }))
  const requiredConcepts = guideConcepts(guide).map(c => `s:${c.id}`)
  const result = selectQuestions(candidates, {
    count: requiredConcepts.length, level: 'medium', types: ['true_false', 'short_answer'],
    requiredTopics: guide.sections.map(s => candidateTopicKey({ sourceId: 's', topic: s.title })),
    requiredConcepts, uniqueConcepts: true,
  })
  assert.deepEqual(result.missingTopics, [])
  assert.deepEqual(result.missingConcepts, [])
  assert.equal(new Set(result.picked.map(q => q.topic)).size, 25)
  const covered = result.picked.flatMap(q => q.conceptKeys ?? [])
  assert.equal(new Set(covered).size, 100)
  assert.equal(covered.length, 100)
})

test('reporta una sección ausente aunque sobren preguntas de los demás temas', () => {
  const candidates = Array.from({ length: 100 }, (_, i) => ({
    id: String(i), sourceId: 's', topic: 'A', type: 'multiple_choice' as const, difficulty: 1 as const,
    timesSeen: 0, lastCredit: null, lastSeenAt: null,
  }))
  const result = selectQuestions(candidates, { count: 20, level: 'easy', types: ['multiple_choice'], requiredTopics: ['s:a', 's:b'] })
  assert.deepEqual(result.missingTopics, ['s:b'])
})


test('los fragmentos largos se inventarían por separado y no se pierde texto', () => {
  const fact = Array.from({ length: 200 }, (_, i) => `dato${i}`).join(' ')
  const long = { ...guide, sections: [{ ...guide.sections[0]!, summary: fact, keyPoints: [], terms: [], tables: [] }] }
  const concepts = guideConcepts(long)
  assert.ok(concepts.length > 1)
  assert.equal(concepts.map(c => c.fact).join(' '), fact)
  assert.ok(concepts.every(c => c.fact.length <= 480))
  for (const question of literalGuideQuestions(long)) {
    assert.equal(supportedBySections({ ...question, data: toQuestionData(question), guideHash: guideFingerprint(long) }, long.sections, guideFingerprint(long)), true)
  }
})

test('dos términos con una misma definición se registran sin crear abiertas ambiguas', () => {
  const ambiguous = { ...guide, sections: [{ ...guide.sections[0]!, summary: '', keyPoints: [], tables: [], terms: [
    { term: 'Alfa', definition: 'Transporta los nutrientes hacia la célula.' },
    { term: 'Beta', definition: 'Transporta los nutrientes hacia la célula.' },
  ] }] }
  assert.equal(guideConcepts(ambiguous).length, 2)
  const questions = literalGuideQuestions(ambiguous)
  assert.deepEqual(questions, [])
  for (const question of questions) assert.equal(conceptKeys('s', { ...question, data: toQuestionData(question) }, ambiguous).length, 1)
})


test('una definición cortada no se convierte en una pregunta de respaldo', () => {
  const definition = Array.from({ length: 120 }, (_, i) => `propiedad${i}`).join(' ')
  const long = { ...guide, sections: [{ ...guide.sections[0]!, summary: '', keyPoints: [], terms: [{ term: 'Citrato', definition }], tables: [] }] }
  const covered = new Set(literalGuideQuestions(long).flatMap(q => conceptKeys('s', { ...q, data: toQuestionData(q) }, long)))
  assert.equal(covered.size, 0)
})

test('las capturas del usuario no vuelven a convertirse en preguntas', () => {
  const bad = { ...guide, sections: [{ ...guide.sections[0]!, terms: [],
    summary: '', keyPoints: [], tip: 'La fosa de la ovulación es pregunta fija de parcial: ¡recuerda que es exclusiva de la yegua!',
    tables: [{ title: '', columns: ['Función', 'Otra'], rows: [['Cópula y lugar de fecundación', 'Producción de progesterona']] }],
  }] }
  assert.deepEqual(literalGuideQuestions(bad), [])
})
