// Corrección. MC, V/F y emparejar se corrigen aquí sin IA; las abiertas van a Gemini en UN solo lote por examen.
import type { Answer, PublicQuestion, QuestionData } from '@vetquiz/shared'
import { getLlm } from '../../ai/gemini.js'
import { GRADING_SYSTEM_PROMPT, gradingUserPrompt, type GradingItem } from '../../ai/prompts.js'
import { OpenGradingResponseSchema, openGradingJsonSchema } from '../../ai/schemas.js'
import { AppError, Errors } from '../../lib/errors.js'
import { withRetry } from '../../lib/retry.js'

export interface Grade {
  credit: number
  feedback: string | null
}

const NO_ANSWER: Grade = { credit: 0, feedback: 'No respondiste esta pregunta.' }

/** Corrige MC, V/F y emparejar. Devuelve null para respuesta abierta (la corrige la IA). */
export function gradeAuto(data: QuestionData, displayOrder: number[] | null, answer: Answer | null): Grade | null {
  if (data.type === 'short_answer') {
    if (answer?.type === 'short_answer' && answer.text.trim().length > 0) return null
    return NO_ANSWER
  }
  if (!answer || answer.type !== data.type) return NO_ANSWER

  if (answer.type === 'multiple_choice' || answer.type === 'true_false') {
    if (data.type !== 'multiple_choice' && data.type !== 'true_false') return NO_ANSWER
    const original = displayOrder ? displayOrder[answer.selectedIndex] : answer.selectedIndex
    if (original === undefined) return NO_ANSWER
    if (original === data.correctIndex) return { credit: 1, feedback: null }
    const why = data.distractorRationales.find((d) => d.optionIndex === original)?.why ?? null
    return { credit: 0, feedback: why }
  }

  if (answer.type === 'matching' && data.type === 'matching') {
    const n = data.pairs.length
    const right = answer.matches.filter((m, i) => m >= 0 && (displayOrder ? displayOrder[m] : m) === i).length
    if (right === n) return { credit: 1, feedback: null }
    // crédito parcial con la misma escala que las abiertas: la mitad o más de los pares = 0.5
    const credit = right / n >= 0.5 ? 0.5 : 0
    return { credit, feedback: `Acertaste ${right} de ${n} pares.` }
  }
  return NO_ANSWER
}

/** Pregunta sin respuesta correcta y con el orden barajado que ve ella durante el examen. */
export function toPublicQuestion(
  q: { id: string; prompt: string; topic: string; data: QuestionData },
  displayOrder: number[] | null,
): PublicQuestion {
  const { data } = q
  switch (data.type) {
    case 'multiple_choice':
      return { id: q.id, type: data.type, prompt: q.prompt, topic: q.topic, options: (displayOrder ?? data.options.map((_, i) => i)).map((i) => data.options[i]!) }
    case 'true_false':
      return { id: q.id, type: data.type, prompt: q.prompt, topic: q.topic, options: data.options }
    case 'matching':
      return {
        id: q.id,
        type: data.type,
        prompt: q.prompt,
        topic: q.topic,
        left: data.pairs.map((p) => p.left),
        right: (displayOrder ?? data.pairs.map((_, i) => i)).map((i) => data.pairs[i]!.right),
      }
    case 'short_answer':
      return { id: q.id, type: data.type, prompt: q.prompt, topic: q.topic }
  }
}

/** Para la revisión: datos y respuesta en el mismo sistema de índices (ver ReviewItemDTO). */
export function toReview(data: QuestionData, displayOrder: number[] | null, answer: Answer | null): { data: QuestionData; answer: Answer | null } {
  if (!displayOrder) return { data, answer }
  if (data.type === 'multiple_choice') {
    const shown = (orig: number) => displayOrder.indexOf(orig)
    return {
      data: {
        ...data,
        options: displayOrder.map((i) => data.options[i]!),
        correctIndex: shown(data.correctIndex),
        distractorRationales: data.distractorRationales.map((d) => ({ ...d, optionIndex: shown(d.optionIndex) })),
      },
      answer,
    }
  }
  if (data.type === 'matching' && answer?.type === 'matching') {
    return { data, answer: { type: 'matching', matches: answer.matches.map((m) => (m >= 0 ? (displayOrder[m] ?? -1) : -1)) } }
  }
  return { data, answer }
}

/** Valida que la respuesta tenga sentido para esa pregunta (tipo e índices dentro de rango). */
export function isValidAnswer(data: QuestionData, displayOrder: number[] | null, answer: Answer): boolean {
  if (answer.type !== data.type) return false
  switch (answer.type) {
    case 'multiple_choice':
      return data.type === 'multiple_choice' && answer.selectedIndex < data.options.length
    case 'true_false':
      return true
    case 'matching': {
      if (data.type !== 'matching') return false
      const n = data.pairs.length
      return answer.matches.length === n && answer.matches.every((m) => m >= -1 && m < (displayOrder?.length ?? n))
    }
    case 'short_answer':
      return true
  }
}

// ── Abiertas con IA ──────────────────────────────────────────

export async function gradeOpenAnswers(items: GradingItem[]): Promise<Map<string, Grade>> {
  if (!items.length) return new Map()
  return withRetry(async () => {
    const raw = await getLlm().generateJson({
      system: GRADING_SYSTEM_PROMPT,
      source: [],
      prompt: gradingUserPrompt(items),
      jsonSchema: openGradingJsonSchema,
      temperature: 0,
    })
    const parsed = OpenGradingResponseSchema.safeParse(raw)
    if (!parsed.success) throw new AppError(502, 'AI_BAD_SHAPE', Errors.aiFailed().message, true)
    const grades = new Map(parsed.data.results.map((r) => [r.questionId, { credit: r.credit, feedback: r.feedback }]))
    // si se saltó alguna, se repite el lote completo
    if (items.some((it) => !grades.has(it.questionId))) throw new AppError(502, 'AI_INCOMPLETE', Errors.aiFailed().message, true)
    return grades
  })
}
