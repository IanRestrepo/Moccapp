import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GuideSection, StudyGuide } from '@vetquiz/shared'
import { guideFingerprint, supportedBySections } from '../src/services/guide-grounding.js'

const section: GuideSection = { title: 'Transporte', location: '', summary: 'El grupo acetilo llega al citosol mediante la lanzadera del citrato.', keyPoints: [], terms: [], tables: [], tip: '', bankTopics: ['Transporte'], images: [] }
const quote = section.summary
const question = (answer: string) => ({ data: { type: 'multiple_choice' as const, options: [answer, 'B', 'C', 'D'], correctIndex: 0, distractorRationales: [] }, sourceQuote: quote })
test('rechaza oxalacetato aunque el tema y la cita sí coincidan', () => {
  assert.equal(supportedBySections(question('Formando citrato por condensación de acetil-CoA con oxalacetato'), [section]), false)
  assert.equal(supportedBySections(question('la lanzadera del citrato'), [section]), true)
})
test('no acepta una cita inventada ni evidencia de otra sección', () => {
  assert.equal(supportedBySections({ ...question('la lanzadera del citrato'), sourceQuote: 'El citrato forma oxalacetato.' }, [section]), false)
  assert.equal(supportedBySections(question('la lanzadera del citrato'), [{ ...section, summary: 'La ACP transporta intermediarios.' }]), false)
})
test('verdadero/falso requiere generación con la guía vigente', () => {
  const guide = { sections: [section] } as StudyGuide
  const hash = guideFingerprint(guide)
  const q = { data: { type: 'true_false' as const, correctIndex: 0, options: ['Verdadero', 'Falso'] as ['Verdadero', 'Falso'], distractorRationales: [] }, sourceQuote: quote, guideHash: hash }
  assert.equal(supportedBySections(q, [section], hash), true)
  assert.equal(supportedBySections({ ...q, guideHash: null }, [section], hash), false)
  assert.equal(supportedBySections(q, [section], 'guía cambiada'), false)
})

test('el banco antiguo no se admite por compartir una respuesta con la guía', () => {
  assert.equal(supportedBySections(question('la lanzadera del citrato'), [section], 'vigente'), false)
  assert.equal(supportedBySections({ ...question('la lanzadera del citrato'), guideHash: 'vigente' }, [section], 'vigente'), true)
})

test('no mezcla evidencia de una sección con respuestas de otra', () => {
  const other = { ...section, title: 'Otra', summary: 'La ACP transporta intermediarios.' }
  assert.equal(supportedBySections(question('La ACP'), [section, other]), false)
  assert.equal(supportedBySections({ ...question('La ACP'), sourceQuote: other.summary }, [section, other]), true)
})

test('abiertas y emparejar requieren todos sus elementos en la sección de la cita', () => {
  const other = { ...section, title: 'Otra', summary: 'La ACP transporta intermediarios.' }
  const open = { sourceQuote: quote, data: { type: 'short_answer' as const, expectedAnswer: 'la lanzadera del citrato', keyPoints: ['La ACP'] } }
  assert.equal(supportedBySections(open, [section, other]), false)
  assert.equal(supportedBySections({ ...open, data: { ...open.data, keyPoints: ['el grupo acetilo'] } }, [section, other]), true)
  const matching = { sourceQuote: quote, data: { type: 'matching' as const, pairs: [{ left: 'el grupo acetilo', right: 'la lanzadera del citrato' }, { left: 'La ACP', right: 'intermediarios' }] } }
  assert.equal(supportedBySections(matching, [section, other]), false)
  assert.equal(supportedBySections({ ...matching, data: { ...matching.data, pairs: matching.data.pairs.slice(0, 1) } }, [section, other]), true)
})


test('la evidencia distingue cargas químicas y letras griegas', () => {
  const scientific = { ...section, summary: 'El NAD participa en la reacción. La subunidad α reconoce el ligando.' }
  const q = { ...question('NAD+'), sourceQuote: scientific.summary }
  assert.equal(supportedBySections(q, [scientific]), false)
  assert.equal(supportedBySections({ ...q, data: { ...q.data, options: ['NAD', 'B', 'C', 'D'] } }, [scientific]), true)
  assert.equal(supportedBySections({ ...q, data: { ...q.data, options: ['β', 'B', 'C', 'D'] } }, [scientific]), false)
  assert.equal(supportedBySections({ ...q, data: { ...q.data, options: ['α', 'B', 'C', 'D'] } }, [scientific]), true)
})
