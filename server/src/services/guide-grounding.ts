// La pertenencia al tema no basta: la respuesta y su evidencia deben estar enseñadas.
import type { GuideSection, QuestionData, StudyGuide } from '@vetquiz/shared'
import { sha256 } from './ingest/hash.js'
import { normalizeGuide as normalize } from './guide-normalize.js'

export function sectionText(s: GuideSection): string {
  return [s.summary, ...s.keyPoints, ...s.terms.flatMap(t => [t.term, t.definition]),
    ...s.tables.flatMap(t => [t.title, ...t.columns, ...t.rows.flat()]), s.tip].join('\n')
}
export const guideText = (g: StudyGuide) => g.sections.map(s => `${s.title}\n${sectionText(s)}`).join('\n\n')

export const guideFingerprint = (g: StudyGuide) => sha256(`review-v3-learning\n${guideText(g)}`)

export function supportedBySections(q: { data: QuestionData; sourceQuote: string; guideHash?: string | null }, sections: GuideSection[], fingerprint?: string): boolean {
  // Las preguntas de la fuente original no fueron generadas con el alcance de esta guía.
  if (fingerprint && q.guideHash !== fingerprint) return false
  // Toda la respuesta debe estar en la MISMA sección que la evidencia.
  return sections.some(section => {
    const text = ` ${normalize(sectionText(section))} `
    const contains = (value: string) => {
      const normalized = normalize(value)
      return !!normalized && text.includes(` ${normalized} `)
    }
    if (!contains(q.sourceQuote)) return false
    // Las paráfrasis solo entran tras la revisión semántica independiente de esta versión.
    if (fingerprint && q.guideHash === fingerprint) return true
    switch (q.data.type) {
      case 'multiple_choice': return contains(q.data.options[q.data.correctIndex] ?? '')
      // La cita respalda el juicio; la procedencia exige la guía vigente.
      case 'true_false': return !!fingerprint && q.guideHash === fingerprint
      case 'matching': return q.data.pairs.length > 0 && q.data.pairs.every(p => contains(p.left) && contains(p.right))
      case 'short_answer': return contains(q.data.expectedAnswer) && q.data.keyPoints.every(contains)
    }
  })
}
