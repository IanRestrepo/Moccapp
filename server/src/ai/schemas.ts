// Salida estructurada de Gemini.
//
// Gemini recibe un JSON Schema PLANO (sin uniones discriminadas) porque es más estable de
// generar; luego Zod valida las reglas por tipo y lo convierte a QuestionData.
// La misma definición Zod produce el `responseJsonSchema` vía z.toJSONSchema, así no hay
// dos fuentes de verdad.
import { z } from 'zod'
import { QUESTION_TYPES, type Difficulty, type QuestionData, type QuestionType } from '@vetquiz/shared'

// ── Pregunta tal como la genera Gemini ───────────────────────

export const GeneratedQuestionSchema = z
  .object({
    type: z.enum(QUESTION_TYPES).describe('Tipo de pregunta'),
    difficulty: z
      .number()
      .int()
      .min(1)
      .max(4)
      .describe('1 recordar, 2 comprender, 3 analizar/relacionar, 4 aplicar en caso clínico corto'),
    topic: z.string().min(2).max(80).describe('Tema corto, p. ej. "Farmacología: AINEs"'),
    prompt: z.string().min(10).max(1200).describe('Enunciado en español. En nivel 4, un caso clínico corto.'),
    options: z
      .array(z.string().min(1).max(300))
      .max(5)
      .describe('multiple_choice: 4 opciones. true_false: ["Verdadero","Falso"]. matching y short_answer: []'),
    correctIndex: z
      .number()
      .int()
      .min(-1)
      .max(4)
      .describe('Índice de la opción correcta en multiple_choice/true_false; -1 en los otros tipos'),
    distractorRationales: z
      .array(
        z.object({
          optionIndex: z.number().int().min(0).max(4),
          why: z.string().min(5).max(400).describe('Por qué esta opción es incorrecta, según la fuente'),
        }),
      )
      .describe('Una entrada por cada opción incorrecta (MC y V/F); [] en los otros tipos'),
    matchingPairs: z
      .array(z.object({ left: z.string().min(1).max(160), right: z.string().min(1).max(160) }))
      .max(6)
      .describe('Solo matching: 3–6 pares correctos. [] en los otros tipos'),
    expectedAnswer: z.string().max(600).describe('Solo short_answer: respuesta modelo de 1–3 frases. "" en los otros'),
    keyPoints: z
      .array(z.string().min(2).max(160))
      .max(5)
      .describe('Solo short_answer: 2–4 ideas clave que debe contener la respuesta. [] en los otros'),
    explanation: z
      .string()
      .min(20)
      .max(1200)
      .describe('Por qué la respuesta correcta es correcta, basado en la fuente'),
    sourceQuote: z
      .string()
      .min(10)
      .max(600)
      .describe('Fragmento LITERAL de la fuente (o transcripción exacta del video) que respalda la respuesta'),
    sourceLocation: z
      .string()
      .max(60)
      .describe('Ubicación del fragmento: "Página 3", "Diapositiva 12", "min 07:32" o "" si no aplica'),
  })
  .superRefine((q, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    switch (q.type) {
      case 'multiple_choice':
        if (q.options.length !== 4) issue('multiple_choice requiere 4 opciones')
        if (q.correctIndex < 0 || q.correctIndex >= q.options.length) issue('correctIndex fuera de rango')
        if (new Set(q.options.map(normalize)).size !== q.options.length) issue('opciones repetidas')
        break
      case 'true_false':
        if (q.options.length !== 2) issue('true_false requiere 2 opciones')
        if (q.correctIndex !== 0 && q.correctIndex !== 1) issue('correctIndex debe ser 0 o 1')
        break
      case 'matching':
        if (q.matchingPairs.length < 3) issue('matching requiere al menos 3 pares')
        if (new Set(q.matchingPairs.map((p) => normalize(p.right))).size !== q.matchingPairs.length)
          issue('matching con respuestas repetidas en la columna derecha')
        break
      case 'short_answer':
        if (q.expectedAnswer.trim().length < 3) issue('short_answer requiere expectedAnswer')
        if (q.keyPoints.length < 1) issue('short_answer requiere keyPoints')
        break
    }
  })

export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>

export const QuestionBankResponseSchema = z.object({
  // Sin mínimos: si la fuente no sirve, Gemini puede mandar título y temas vacíos junto con insufficientContent
  title: z.string().max(120).describe('Título corto y claro para la fuente, en español'),
  topics: z.array(z.string().max(60)).max(12).describe('Temas principales cubiertos por la fuente'),
  insufficientContent: z
    .boolean()
    .describe('true si la fuente no tiene suficiente contenido académico para hacer preguntas'),
  questions: z.array(z.unknown()).describe('Lista de preguntas'),
})

/**
 * Las preguntas se validan UNA POR UNA: si Gemini daña 3 de 50, guardamos 47 en vez de
 * tirar el lote entero. Esto devuelve las válidas y la cantidad de descartadas.
 */
export function parseQuestions(raw: unknown[]): { valid: GeneratedQuestion[]; rejected: number } {
  const valid: GeneratedQuestion[] = []
  let rejected = 0
  for (const item of raw) {
    const r = GeneratedQuestionSchema.safeParse(item)
    if (r.success) valid.push(r.data)
    else rejected++
  }
  return { valid, rejected }
}

/** Convierte la forma plana de Gemini a la forma por tipo que se guarda en question_bank.data */
export function toQuestionData(q: GeneratedQuestion): QuestionData {
  switch (q.type) {
    case 'multiple_choice':
      return {
        type: 'multiple_choice',
        options: q.options,
        correctIndex: q.correctIndex,
        distractorRationales: q.distractorRationales.filter((d) => d.optionIndex !== q.correctIndex),
      }
    case 'true_false':
      return {
        type: 'true_false',
        options: ['Verdadero', 'Falso'],
        correctIndex: q.correctIndex as 0 | 1,
        distractorRationales: q.distractorRationales.filter((d) => d.optionIndex !== q.correctIndex),
      }
    case 'matching':
      return { type: 'matching', pairs: q.matchingPairs }
    case 'short_answer':
      return { type: 'short_answer', expectedAnswer: q.expectedAnswer, keyPoints: q.keyPoints }
  }
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Corrección de respuestas abiertas ────────────────────────

export const OpenGradingResponseSchema = z.object({
  results: z.array(
    z.object({
      questionId: z.string().describe('El id recibido, sin modificar'),
      credit: z
        .union([z.literal(0), z.literal(0.5), z.literal(1)])
        .describe('1 = completa y correcta; 0.5 = parcialmente correcta; 0 = incorrecta o vacía'),
      matchedKeyPoints: z.array(z.string()).describe('Ideas clave que SÍ aparecen en la respuesta'),
      feedback: z
        .string()
        .min(10)
        .max(600)
        .describe('Retroalimentación en segunda persona (tú): qué estuvo bien, qué faltó o qué es incorrecto'),
    }),
  ),
})
export type OpenGradingResponse = z.infer<typeof OpenGradingResponseSchema>

// ── JSON Schemas para config.responseJsonSchema ──────────────

/** Gemini no necesita los refinamientos; solo la forma. */
export const questionBankJsonSchema = z.toJSONSchema(
  QuestionBankResponseSchema.extend({
    questions: z.array(GeneratedQuestionSchema).describe('Lista de preguntas'),
  }),
  { target: 'draft-7', unrepresentable: 'any' },
)

export const openGradingJsonSchema = z.toJSONSchema(OpenGradingResponseSchema, {
  target: 'draft-7',
  unrepresentable: 'any',
})

// ── Plan de generación ───────────────────────────────────────

export interface GenerationPlan {
  /** Cantidad por dificultad */
  byDifficulty: Partial<Record<Difficulty, number>>
  /** Cantidad mínima por tipo dentro del lote */
  byType: Partial<Record<QuestionType, number>>
}

/** Banco inicial: 48 preguntas, en 2 llamadas paralelas de 24 (más rápido y menos riesgo de JSON cortado). */
export const INITIAL_BANK_PLANS: GenerationPlan[] = [
  {
    byDifficulty: { 1: 12, 2: 12 },
    byType: { multiple_choice: 12, true_false: 6, matching: 3, short_answer: 3 },
  },
  {
    byDifficulty: { 3: 12, 4: 12 },
    byType: { multiple_choice: 14, true_false: 2, matching: 3, short_answer: 5 },
  },
]
