// Tipos y validaciones compartidas entre client/ y server/.
// Los contratos de la API viven aquí para que ambos lados no se desincronicen.
import { z } from 'zod'

// ── Enums de dominio ─────────────────────────────────────────

export const SOURCE_KINDS = ['file', 'text', 'youtube'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

export const SOURCE_STATUSES = ['processing', 'ready', 'error'] as const
export type SourceStatus = (typeof SOURCE_STATUSES)[number]

export const QUESTION_TYPES = ['multiple_choice', 'true_false', 'matching', 'short_answer'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Opción múltiple',
  true_false: 'Verdadero / Falso',
  matching: 'Emparejar',
  short_answer: 'Respuesta corta',
}

/** Nivel elegido en la UI. Cada uno apunta a un nivel 1–4 del banco. */
export const EXAM_LEVELS = ['easy', 'medium', 'hard', 'utp'] as const
export type ExamLevel = (typeof EXAM_LEVELS)[number]

export const EXAM_LEVEL_LABELS: Record<ExamLevel, string> = {
  easy: 'Fácil',
  medium: 'Medio',
  hard: 'Difícil',
  utp: 'Parcial UTP',
}

export const LEVEL_TO_DIFFICULTY: Record<ExamLevel, Difficulty> = {
  easy: 1,
  medium: 2,
  hard: 3,
  utp: 4,
}

/** 1 = recordar, 2 = comprender, 3 = analizar/relacionar, 4 = aplicar en caso clínico */
export type Difficulty = 1 | 2 | 3 | 4

export const SOURCE_COLORS = ['orange', 'yellow', 'lilac', 'pink', 'mint', 'sky'] as const
export type SourceColor = (typeof SOURCE_COLORS)[number]

// ── Preguntas ────────────────────────────────────────────────

export interface MatchingPair {
  left: string
  right: string
}

export interface DistractorRationale {
  /** Índice de la opción incorrecta (MC/VF) */
  optionIndex: number
  why: string
}

/** Datos específicos por tipo, guardados en question_bank.data (jsonb). */
export type QuestionData =
  | {
      type: 'multiple_choice'
      options: string[]
      correctIndex: number
      distractorRationales: DistractorRationale[]
    }
  | {
      type: 'true_false'
      /** Siempre ['Verdadero', 'Falso'] */
      options: string[]
      correctIndex: 0 | 1
      distractorRationales: DistractorRationale[]
    }
  | {
      type: 'matching'
      /** En el orden correcto; el cliente baraja la columna derecha. */
      pairs: MatchingPair[]
    }
  | {
      type: 'short_answer'
      expectedAnswer: string
      /** Ideas clave que la corrección con IA busca en la respuesta */
      keyPoints: string[]
    }

/** Respuesta de la estudiante, según el tipo de pregunta. */
export const AnswerSchema = z.discriminatedUnion('type', [
  // selectedIndex siempre se refiere al orden MOSTRADO; el servidor guarda la permutación
  z.object({ type: z.literal('multiple_choice'), selectedIndex: z.number().int().min(0) }),
  z.object({ type: z.literal('true_false'), selectedIndex: z.union([z.literal(0), z.literal(1)]) }),
  z.object({
    type: z.literal('matching'),
    /** matches[i] = índice (en la lista `right` MOSTRADA) elegido para la izquierda i; -1 = sin responder */
    matches: z.array(z.number().int().min(-1)),
  }),
  z.object({ type: z.literal('short_answer'), text: z.string().max(2000) }),
])
export type Answer = z.infer<typeof AnswerSchema>

/**
 * Pregunta tal como la ve el cliente DURANTE el examen: sin respuesta correcta y con
 * las opciones (MC) o la columna derecha (emparejar) ya barajadas en el servidor.
 */
export type PublicQuestion =
  | { id: string; type: 'multiple_choice' | 'true_false'; prompt: string; topic: string; options: string[] }
  | { id: string; type: 'matching'; prompt: string; topic: string; left: string[]; right: string[] }
  | { id: string; type: 'short_answer'; prompt: string; topic: string }

// ── Requests ─────────────────────────────────────────────────

export const CreateTextSourceSchema = z.object({
  kind: z.literal('text'),
  title: z.string().trim().min(1).max(120).optional(),
  text: z.string().trim().min(200, 'Pega al menos un párrafo (200 caracteres).').max(400_000),
})

export const CreateYoutubeSourceSchema = z.object({
  kind: z.literal('youtube'),
  title: z.string().trim().min(1).max(120).optional(),
  url: z.string().url(),
})

export const CreateExamSchema = z.object({
  /** Una o varias fuentes: el examen mezcla preguntas de todas (p. ej. varias presentaciones de la misma materia) */
  sourceIds: z.array(z.string().uuid()).min(1, 'Elige al menos una fuente.').max(12),
  level: z.enum(EXAM_LEVELS),
  timeLimitMin: z.number().int().min(3).max(180),
  /** Opcional: si no viene se calcula a partir del tiempo */
  questionCount: z.number().int().min(3).max(60).optional(),
  types: z.array(z.enum(QUESTION_TYPES)).min(1),
})
export type CreateExamInput = z.infer<typeof CreateExamSchema>

export const SaveAnswerSchema = z.object({
  answer: AnswerSchema.nullable(),
  timeSpentSec: z.number().int().min(0).max(36_000).optional(),
})

export const SubmitExamSchema = z.object({
  /** true cuando lo envía el cronómetro al llegar a 0 */
  auto: z.boolean().default(false),
  /** Último estado de respuestas por si el autosave no alcanzó a llegar */
  answers: z
    .array(z.object({ questionId: z.string().uuid(), answer: AnswerSchema.nullable() }))
    .optional(),
})

// ── Responses ────────────────────────────────────────────────

export interface BankStats {
  total: number
  byDifficulty: Record<Difficulty, number>
  byType: Record<QuestionType, number>
}

export const SOURCE_FORMATS = ['pdf', 'docx', 'pptx', 'image', 'text', 'youtube'] as const
export type SourceFormat = (typeof SOURCE_FORMATS)[number]

export interface SourceDTO {
  id: string
  title: string
  kind: SourceKind
  /** Para el ícono y la hoja que asoma de la carpeta */
  format: SourceFormat
  mimeType: string | null
  color: SourceColor
  status: SourceStatus
  errorMessage: string | null
  topics: string[]
  thumbnailUrl: string | null
  /** Fragmento real de la fuente (texto extraído o una cita del banco) */
  excerpt: string | null
  bank: BankStats
  examsTaken: number
  bestScore: number | null
  createdAt: string
}

export interface ExamInProgressDTO {
  id: string
  sourceId: string
  sourceIds: string[]
  sourceTitle: string
  level: ExamLevel
  status: 'in_progress'
  questions: PublicQuestion[]
  savedAnswers: Record<string, Answer | null>
  startedAt: string
  deadlineAt: string
  /** Para corregir el desfase del reloj del celular */
  serverNow: string
}

export interface ReviewItemDTO {
  questionId: string
  position: number
  type: QuestionType
  prompt: string
  topic: string
  difficulty: Difficulty
  /**
   * MC: opciones en el orden en que ella las vio (correctIndex y selectedIndex coinciden).
   * Emparejar: `pairs` en el orden correcto y `answer.matches[i]` traducido a índices de `pairs`
   * (matches[i] === i significa que acertó ese par).
   */
  data: QuestionData
  answer: Answer | null
  /** 0, 0.5 o 1 */
  credit: number
  /** Retroalimentación de la IA (abiertas) o por qué la opción elegida no era (MC/VF) */
  feedback: string | null
  explanation: string
  sourceQuote: string
  sourceLocation: string | null
}

export interface ExamResultDTO {
  id: string
  sourceId: string
  sourceIds: string[]
  sourceTitle: string
  level: ExamLevel
  status: 'completed'
  /** 0.0 – 5.0 con un decimal */
  score: number
  percent: number
  passed: boolean
  timeLimitSec: number
  timeUsedSec: number
  autoSubmitted: boolean
  xpEarned: number
  /** Huesitos (moneda de premios) que dio este examen */
  bonesEarned: number
  streak: { current: number; extendedToday: boolean }
  motivation: string
  items: ReviewItemDTO[]
  failedCount: number
  finishedAt: string
}

/** Respuestas guardadas pero la corrección de las abiertas quedó pendiente (Gemini no respondió) */
export interface ExamGradingDTO {
  id: string
  sourceId: string
  status: 'grading'
}

export type ExamDTO = ExamInProgressDTO | ExamGradingDTO | ExamResultDTO

export interface CreateExamResponse {
  exam: ExamInProgressDTO
  /** true si hubo que generar más preguntas con IA antes de armarlo */
  bankExpanded: boolean
  /** Si el banco no alcanzó, el examen trae menos preguntas de las pedidas */
  shortBy: number
}

export interface ExamHistoryItemDTO {
  id: string
  sourceId: string
  sourceTitle: string
  sourceColor: SourceColor
  level: ExamLevel
  mode: 'normal' | 'retry_failed'
  score: number | null
  percent: number | null
  questionCount: number
  timeUsedSec: number | null
  status: 'in_progress' | 'grading' | 'completed'
  createdAt: string
}

export const UpdateStatsSchema = z.object({
  soundEnabled: z.boolean().optional(),
  displayName: z.string().trim().min(1).max(40).optional(),
})

export interface StatsDTO {
  displayName: string
  soundEnabled: boolean
  totalXp: number
  level: number
  xpIntoLevel: number
  xpForNextLevel: number
  currentStreak: number
  longestStreak: number
  studiedToday: boolean
  examsCompleted: number
  /** Saldo de huesitos para canjear premios */
  bones: number
  /** Últimos 7 días (YYYY-MM-DD) con examen completado */
  week: { date: string; active: boolean }[]
}

export interface ApiError {
  error: { code: string; message: string; retryable: boolean }
}

// ── Reglas puras compartidas ─────────────────────────────────

/** Nota colombiana 0.0–5.0 con un decimal. Aprobado ≥ 3.0 */
export function toColombianScore(ratio: number): number {
  return Math.round(Math.min(1, Math.max(0, ratio)) * 50) / 10
}

/** Segundos estimados por pregunta (para calcular la cantidad según el tiempo). */
export const SECONDS_PER_QUESTION: Record<QuestionType, number> = {
  true_false: 30,
  multiple_choice: 60,
  matching: 120,
  short_answer: 150,
}

/** Multiplicador por nivel: un caso clínico toma más que un dato de memoria. */
export const LEVEL_TIME_FACTOR: Record<ExamLevel, number> = {
  easy: 0.8,
  medium: 1,
  hard: 1.2,
  utp: 1.5,
}

// ── XP y niveles ─────────────────────────────────────────────

export const LEVEL_XP_MULTIPLIER: Record<ExamLevel, number> = { easy: 1, medium: 1.25, hard: 1.5, utp: 2 }

/** XP acumulada necesaria para llegar al nivel `n` (nivel 1 = 0 XP, 2 = 50, 3 = 200, 4 = 450…) */
export const xpForLevel = (n: number) => 50 * (n - 1) ** 2
export const levelFromXp = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1

export function suggestQuestionCount(timeLimitMin: number, types: QuestionType[], level: ExamLevel): number {
  const avg = types.reduce((s, t) => s + SECONDS_PER_QUESTION[t], 0) / types.length
  const n = Math.floor((timeLimitMin * 60) / (avg * LEVEL_TIME_FACTOR[level]))
  return Math.min(40, Math.max(5, n))
}

// ── YouTube ──────────────────────────────────────────────────

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

/** Acepta youtu.be, watch?v=, shorts, embed, live y m.youtube. Devuelve null si no es un video. */
export function parseYoutubeId(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else id = /^\/(shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname)?.[2] ?? null
  }
  return id && YOUTUBE_ID.test(id) ? id : null
}

// ── Premios (huesitos) ───────────────────────────────────────

/** Huesitos: la moneda con la que Ashley canjea premios. Reglas aparte de la XP. */
export const BONE_RULES = {
  finish: 5,
  perCorrect: 1,
  /** nota ≥ 4,0 */
  goodScore: 10,
  /** 100 % de acierto */
  perfect: 25,
  /** primer examen del día: × días de racha (hasta 7) */
  streakPerDay: 3,
  streakCap: 7,
  /** los bonos de nota y perfecto solo cuentan en exámenes de 5 preguntas o más */
  minQuestionsForBonus: 5,
} as const

export function computeBones(p: { credits: number; questionCount: number; score: number; percent: number; firstOfDay: boolean; streak: number }): number {
  const r = BONE_RULES
  const bonusOk = p.questionCount >= r.minQuestionsForBonus
  return (
    r.finish +
    Math.floor(p.credits) * r.perCorrect +
    (bonusOk && p.score >= 4 ? r.goodScore : 0) +
    (bonusOk && p.percent >= 100 ? r.perfect : 0) +
    (p.firstOfDay ? r.streakPerDay * Math.min(p.streak, r.streakCap) : 0)
  )
}

export const REWARD_STICKERS = ['icecream', 'coffee', 'cake', 'ticket', 'dinner', 'spa', 'mountain', 'plane', 'gift'] as const
export type RewardSticker = (typeof REWARD_STICKERS)[number]

export const RewardInputSchema = z.object({
  name: z.string().trim().min(1, 'Ponle nombre al premio.').max(60),
  description: z.string().trim().max(140).default(''),
  sticker: z.enum(REWARD_STICKERS),
  cost: z.number().int().min(1).max(1_000_000),
  sort: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
})
export type RewardInput = z.infer<typeof RewardInputSchema>

export interface RewardDTO {
  id: string
  name: string
  description: string
  sticker: RewardSticker
  cost: number
  sort: number
  active: boolean
}

export interface RedemptionDTO {
  id: string
  rewardName: string
  sticker: RewardSticker
  cost: number
  status: 'pending' | 'delivered' | 'cancelled'
  createdAt: string
  resolvedAt: string | null
}

export interface RewardsDTO {
  ownerName: string
  /** Saldo disponible para canjear */
  balance: number
  /** Huesitos ganados en total (nunca baja) */
  earnedTotal: number
  rewards: RewardDTO[]
  redemptions: RedemptionDTO[]
}

export interface RedeemResponse {
  redemption: RedemptionDTO
  balance: number
  /** Link de WhatsApp con el aviso listo para el administrador (null si no está configurado) */
  whatsappUrl: string | null
}

export interface AdminRewardsDTO extends RewardsDTO {
  whatsappConfigured: boolean
}
