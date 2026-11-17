import { z } from 'zod'
import type { StudyGuide } from '@vetquiz/shared'
import type { GeneratedQuestion } from '../ai/schemas.js'
import { getLlm } from '../ai/gemini.js'
import { guideText } from './guide-grounding.js'

export const GUIDE_REVIEW_SYSTEM = `Eres una revisora independiente de preguntas de estudio.
Aprueba solo si TODO el enunciado se puede resolver con la sección indicada de la guía adjunta, sin conocimientos externos.
Verifica la relación entre cita, enunciado y respuesta, no solo palabras compartidas.
Comprueba cada asociación en matching, la verdad o falsedad completa en true_false y que no haya dos respuestas válidas.
Rechaza preguntas ambiguas, detalles no enseñados, explicaciones externas y distractores que requieren estudiar otras secciones.
Rechaza preguntas sobre lo que dice o no dice el documento, dobles negaciones, consejos de estudio,
fragmentos incompletos o filas de tablas pegadas. Debe ser una pregunta natural sobre el concepto, su función o aplicación.
Verifica que todos los términos necesarios, incluso los distractores, sean comprensibles con esta sección.
Devuelve únicamente los índices de las preguntas que cumplen TODOS los criterios. Ante duda, rechaza.`
const Review = z.object({ approved: z.array(z.number().int().nonnegative()) })

export async function reviewGuideQuestions(guide: StudyGuide, questions: GeneratedQuestion[]): Promise<GeneratedQuestion[]> {
  if (!questions.length) return []
  const accepted: GeneratedQuestion[] = []
  for (const section of guide.sections) {
    const candidates = questions.filter(q => q.topic === section.title && !/según (la guía|el documento)|es falsa esta afirmación|aparece este fragmento|pregunta fija de parcial/i.test(q.prompt))
    if (!candidates.length) continue
    try {
      const raw = await getLlm().generateJson({
        system: GUIDE_REVIEW_SYSTEM, source: [{ text: guideText({ ...guide, sections: [section] }) }],
        prompt: JSON.stringify(candidates.map((q, index) => ({ index, ...q }))),
        jsonSchema: z.toJSONSchema(Review), temperature: 0, thinking: 'low',
      })
      const approved = new Set(Review.parse(raw).approved)
      accepted.push(...candidates.filter((_, index) => approved.has(index)))
    } catch { /* No admitir preguntas sin revisar. */ }
  }
  return accepted
}
