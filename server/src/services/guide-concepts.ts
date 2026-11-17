import type { GuideSection, QuestionData, StudyGuide } from '@vetquiz/shared'
import type { GeneratedQuestion } from '../ai/schemas.js'
import { normalizeGuide as normalize } from './guide-normalize.js'
import { sha256 } from './ingest/hash.js'

export interface GuideConcept { id: string; section: number; fact: string; term?: string; fragment?: boolean }

/** Inventario de lo enseñado: definiciones, ideas clave, filas de tablas y frases del resumen. */
export function guideConcepts(guide: Pick<StudyGuide, 'sections'>): GuideConcept[] {
  return guide.sections.flatMap((section, index) => {
    const seen = new Set<string>()
    const facts = [
      ...section.terms.map(t => ({ fact: t.definition, term: t.term })),
      ...section.keyPoints.map(fact => ({ fact })),
      ...section.tables.flatMap(t => t.rows.map(row => ({ fact: row.join(' ') }))),
      ...section.summary.split(/(?<=[.!?])\s+|\n+/u).map(fact => ({ fact })),

    ]
    const fragments = facts.flatMap(({ fact, ...extra }) => {
      const parts: { fact: string; term?: string }[] = []
      let rest = fact.trim()
      while (rest.length > 480) {
        const space = rest.lastIndexOf(' ', 480)
        const cut = space > 0 ? space : 480
        parts.push({ fact: rest.slice(0, cut), ...extra })
        rest = rest.slice(cut).trim()
      }
      if (rest) parts.push({ fact: rest, ...extra })
      return parts.map(part => ({ ...part, fragment: parts.length > 1 }))
    })
    return fragments.flatMap(({ fact, ...extra }) => {
      fact = fact.trim()
      if (/pregunta fija|parcial|recuerda|según (la guía|el documento)/i.test(fact)) return []
      const key = `${normalize(extra.term ?? '')}:${normalize(fact)}`
      if (normalize(fact).length < 5 || seen.has(key)) return []
      seen.add(key)
      return [{ id: sha256(`${index}:${key}`).slice(0, 24), section: index, fact, ...extra }]
    })
  })
}

export function conceptKeys(sourceId: string, question: { topic: string; sourceQuote: string; data: QuestionData; prompt?: string }, guide: StudyGuide): string[] {
  const quote = normalize(question.sourceQuote)
  const concepts = guideConcepts(guide).filter(c => {
    const section = guide.sections[c.section]!
    if (normalize(section.title) !== normalize(question.topic) && !section.bankTopics.some(t => normalize(t) === normalize(question.topic))) return false
    const fact = normalize(c.fact)
    if (c.term) {
      const answer = question.data.type === 'multiple_choice' ? question.data.options[question.data.correctIndex] ?? '' :
        question.data.type === 'short_answer' ? question.data.expectedAnswer :
        question.data.type === 'matching' ? question.data.pairs.flatMap(p => [p.left, p.right]).join(' ') : ''
      const named = ` ${normalize(`${question.prompt ?? ''} ${answer}`)} `
      if (!named.includes(` ${normalize(c.term)} `)) return false
    }
    return !!quote && (quote.includes(fact) || fact.includes(quote))
  })
  return concepts.length ? concepts.map(c => `${sourceId}:${c.id}`) : [`${sourceId}:quote:${sha256(quote).slice(0, 24)}`]
}

/** Respaldo limitado a definiciones completas y unívocas. Nunca fabricar V/F con fragmentos. */
export function literalGuideQuestions(guide: StudyGuide): GeneratedQuestion[] {
  return guide.sections.flatMap(section => section.terms.flatMap(term => {
    const fact = term.definition.trim()
    if (fact.length < 12 || fact.length > 480 || /parcial|recuerda|pregunta fija|según (la guía|el documento)/i.test(fact)) return []
    if (section.terms.filter(t => normalize(t.definition) === normalize(fact)).length !== 1) return []
    const others = section.terms.filter(t => normalize(t.term) !== normalize(term.term) && normalize(t.definition) !== normalize(fact))
      .filter((t, i, all) => all.findIndex(o => normalize(o.term) === normalize(t.term)) === i).slice(0, 3)
    const base = { difficulty: 1, topic: section.title, sourceQuote: fact, sourceLocation: `Guía: ${section.title}`,
      explanation: `${term.term}: ${fact}`, matchingPairs: [], expectedAnswer: '', keyPoints: [], distractorRationales: [] }
    const open: GeneratedQuestion = { ...base, type: 'short_answer', prompt: `¿Qué concepto corresponde a esta definición? ${fact}`,
      options: [], correctIndex: -1, expectedAnswer: term.term, keyPoints: [term.term] }
    const mc: GeneratedQuestion[] = others.length === 3 ? [{ ...base, type: 'multiple_choice',
      prompt: `¿Qué concepto corresponde a esta definición? ${fact}`, options: [term.term, ...others.map(t => t.term)], correctIndex: 0,
      distractorRationales: others.map((t, optionIndex) => ({ optionIndex: optionIndex + 1, why: `${t.term}: ${t.definition}` })) }] : []
    return [open, ...mc]
  }))
}
