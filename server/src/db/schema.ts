import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import {
  EXAM_LEVELS,
  QUESTION_TYPES,
  SOURCE_COLORS,
  SOURCE_KINDS,
  SOURCE_STATUSES,
  type Answer,
  type Difficulty,
  type QuestionData,
  type QuestionType,
} from '@vetquiz/shared'

// ── Enums ────────────────────────────────────────────────────

export const sourceKind = pgEnum('source_kind', SOURCE_KINDS)
export const sourceStatus = pgEnum('source_status', SOURCE_STATUSES)
export const sourceColor = pgEnum('source_color', SOURCE_COLORS)
export const questionType = pgEnum('question_type', QUESTION_TYPES)
export const examLevel = pgEnum('exam_level', EXAM_LEVELS)
export const examMode = pgEnum('exam_mode', ['normal', 'retry_failed'])
export const examStatus = pgEnum('exam_status', ['in_progress', 'grading', 'completed'])
export const gradedBy = pgEnum('graded_by', ['auto', 'ai'])

export interface GeminiFileRef {
  uri: string
  mimeType: string
  /** ISO */
  expiresAt: string
  fromPage?: number
  toPage?: number
}

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}

// ── sources ──────────────────────────────────────────────────
// Una fuente de estudio. El hash evita regenerar el banco si sube el mismo material dos veces.

export const sources = pgTable(
  'sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    /** Perfil que la subió; las invitadas ven también las de la dueña */
    owner: text('owner').notNull().default('ash'),
    /** true si ella escribió o editó el título: la IA no lo reemplaza */
    titleLocked: boolean('title_locked').notNull().default(false),
    kind: sourceKind('kind').notNull(),
    color: sourceColor('color').notNull(),
    status: sourceStatus('status').notNull().default('processing'),
    /** Completando el banco en segundo plano desde esta hora (null = no). En la base y no en memoria: en Vercel cada petición puede caer en otra instancia */
    fillingSince: timestamp('filling_since', { withTimezone: true }),
    errorMessage: text('error_message'),

    /** sha256 de los bytes del archivo / texto normalizado / id del video de YouTube */
    contentHash: text('content_hash').notNull(),

    // Archivo
    originalName: text('original_name'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    /** Ruta relativa dentro de STORAGE_DIR (o key de S3/R2 más adelante) */
    storageKey: text('storage_key'),
    /** URL externa (miniatura de YouTube) o key en STORAGE_DIR */
    thumbnailUrl: text('thumbnail_url'),

    /** Texto pegado, o texto extraído de DOCX/PPTX. Null para PDF/imagen/YouTube (Gemini los lee nativo). */
    extractedText: text('extracted_text'),

    // YouTube
    youtubeUrl: text('youtube_url'),
    youtubeVideoId: text('youtube_video_id'),

    /**
     * Archivos subidos con la File API de Gemini (caducan a las 48 h; se re-suben si hace falta).
     * Un PDF de más de 40 MB se divide en varias partes, cada una con su rango de páginas.
     */
    geminiFiles: jsonb('gemini_files').$type<GeminiFileRef[]>().notNull().default([]),

    /** Temas detectados al generar el banco; se usan como chips en la UI */
    topics: jsonb('topics').$type<string[]>().notNull().default([]),

    ...timestamps,
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sources_content_hash_uq').on(t.contentHash)],
)

// ── question_bank ────────────────────────────────────────────
// Banco por fuente. Los exámenes se arman desde aquí sin llamar a la IA.

export const questionBank = pgTable(
  'question_bank',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    type: questionType('type').notNull(),
    /** 1 recordar · 2 comprender · 3 analizar · 4 aplicar (caso clínico / Parcial UTP) */
    difficulty: smallint('difficulty').$type<Difficulty>().notNull(),
    topic: text('topic').notNull(),
    prompt: text('prompt').notNull(),
    /** Opciones, respuesta correcta y razones de los distractores, según el tipo */
    data: jsonb('data').$type<QuestionData>().notNull(),
    explanation: text('explanation').notNull(),
    /** Fragmento LITERAL de la fuente que respalda la respuesta */
    sourceQuote: text('source_quote').notNull(),
    /** "Página 4", "Diapositiva 12", "min 07:32"… */
    sourceLocation: text('source_location'),
    /** 0 = banco inicial; 1, 2… = ampliaciones */
    generationBatch: smallint('generation_batch').notNull().default(0),
    /** Versión de las reglas del prompt con que se generó (BANK_PROMPT_VERSION) */
    promptVersion: smallint('prompt_version').notNull().default(1),
    /** Normalizado para detectar duplicados al ampliar */
    promptHash: text('prompt_hash').notNull(),
    ...timestamps,
  },
  (t) => [
    index('question_bank_source_idx').on(t.sourceId, t.difficulty, t.type),
    uniqueIndex('question_bank_source_prompt_uq').on(t.sourceId, t.promptHash),
    check('difficulty_range', sql`${t.difficulty} between 1 and 4`),
  ],
)

// ── exams ────────────────────────────────────────────────────

export const exams = pgTable(
  'exams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    /** Todas las fuentes del examen (sourceId es la primera). Varias = examen que mezcla presentaciones */
    sourceIds: jsonb('source_ids').$type<string[]>().notNull().default([]),
    /** Perfil que lo presentó */
    profile: text('profile').notNull().default('ash'),
    mode: examMode('mode').notNull().default('normal'),
    /** Examen del que salieron las preguntas falladas (modo retry_failed) */
    parentExamId: uuid('parent_exam_id').references((): AnyPgColumn => exams.id, { onDelete: 'set null' }),
    level: examLevel('level').notNull(),
    questionTypes: jsonb('question_types').$type<QuestionType[]>().notNull(),
    questionCount: smallint('question_count').notNull(),
    timeLimitSec: integer('time_limit_sec').notNull(),
    status: examStatus('status').notNull().default('in_progress'),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    timeUsedSec: integer('time_used_sec'),
    autoSubmitted: boolean('auto_submitted').notNull().default(false),

    /** Suma de créditos / número de preguntas */
    percent: real('percent'),
    /** 0.0 – 5.0 */
    score: real('score'),
    xpEarned: integer('xp_earned').notNull().default(0),
    /** Huesitos (moneda de premios) que dio este examen */
    bonesEarned: integer('bones_earned').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('exams_source_idx').on(t.sourceId, t.createdAt), index('exams_created_idx').on(t.createdAt)],
)

// ── exam_answers ─────────────────────────────────────────────
// Una fila por pregunta del examen, creada al armarlo (así el orden y el barajado quedan fijos).

export const examAnswers = pgTable(
  'exam_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questionBank.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    /**
     * Permutación mostrada: MC → orden de opciones; emparejar → orden de la columna derecha.
     * displayOrder[i] = índice original del elemento que se mostró en la posición i.
     */
    displayOrder: jsonb('display_order').$type<number[]>(),
    /** En el orden MOSTRADO (lo que mandó el cliente) */
    answer: jsonb('answer').$type<Answer | null>(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    timeSpentSec: integer('time_spent_sec'),

    /** 0 · 0.5 · 1 */
    credit: real('credit'),
    gradedBy: gradedBy('graded_by'),
    /** Retroalimentación de la IA (respuesta abierta) o razón del distractor elegido */
    feedback: text('feedback'),
  },
  (t) => [
    uniqueIndex('exam_answers_exam_question_uq').on(t.examId, t.questionId),
    index('exam_answers_question_idx').on(t.questionId),
  ],
)

// ── user_stats ───────────────────────────────────────────────
// Una sola fila (id = 1) mientras no haya autenticación. Base para gamificación futura.

export const userStats = pgTable(
  'user_stats',
  {
    id: smallint('id').primaryKey().default(1),
    displayName: text('display_name').notNull().default('Doc'),
    totalXp: integer('total_xp').notNull().default(0),
    currentStreak: integer('current_streak').notNull().default(0),
    longestStreak: integer('longest_streak').notNull().default(0),
    /** Fecha local (APP_TIMEZONE) del último examen completado */
    lastActiveDate: date('last_active_date'),
    /** Fechas activas recientes (YYYY-MM-DD) para pintar la semana en Inicio */
    activeDates: jsonb('active_dates').$type<string[]>().notNull().default([]),
    examsCompleted: integer('exams_completed').notNull().default(0),
    soundEnabled: boolean('sound_enabled').notNull().default(true),
    /** Huesitos ganados en total (exámenes + regalos). Saldo = ganados − canjes no cancelados */
    bonesEarned: integer('bones_earned').notNull().default(0),
    /** Ya se abonaron los huesitos de los exámenes hechos antes de que existieran los premios */
    bonesBackfilled: boolean('bones_backfilled').notNull().default(false),
    /** Última señal de vida de la app de Ashley (no cuenta al administrador) */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    lastSeenView: text('last_seen_view'),
    lastSeenDevice: text('last_seen_device'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // una fila por perfil: 1 = Ash (la de siempre), 2… = invitadas (ver lib/profile.ts)
)

// ── rewards / redemptions ────────────────────────────────────
// Premios que Ashley canjea con huesitos. Los define y entrega el administrador.

export const redemptionStatus = pgEnum('redemption_status', ['pending', 'delivered', 'cancelled'])

export const rewards = pgTable('rewards', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  /** Nombre del sticker del cliente (icecream, coffee, cake…) */
  sticker: text('sticker').notNull(),
  cost: integer('cost').notNull(),
  sort: smallint('sort').notNull().default(0),
  active: boolean('active').notNull().default(true),
  ...timestamps,
})

export const redemptions = pgTable(
  'redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rewardId: uuid('reward_id').references(() => rewards.id, { onDelete: 'set null' }),
    /** Copia del premio al momento de reclamarlo (si después se edita, el canje no cambia) */
    rewardName: text('reward_name').notNull(),
    sticker: text('sticker').notNull(),
    cost: integer('cost').notNull(),
    status: redemptionStatus('status').notNull().default('pending'),
    ...timestamps,
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('redemptions_created_idx').on(t.createdAt)],
)

export type Reward = typeof rewards.$inferSelect
export type Redemption = typeof redemptions.$inferSelect

export type Source = typeof sources.$inferSelect
export type NewSource = typeof sources.$inferInsert
export type BankQuestion = typeof questionBank.$inferSelect
export type NewBankQuestion = typeof questionBank.$inferInsert
export type Exam = typeof exams.$inferSelect
export type ExamAnswer = typeof examAnswers.$inferSelect
// ── path_progress ────────────────────────────────────────────
// Camino tipo Duolingo: un registro por nodo completado (lección o cofre). node_key = "<sourceId>:<n>" o "<sourceId>:chest".
export const pathProgress = pgTable(
  'path_progress',
  {
    profile: text('profile').notNull().default('ash'),
    nodeKey: text('node_key').notNull(),
    /** 1–3 según aciertos a la primera; los cofres guardan 3 */
    stars: smallint('stars').notNull(),
    attempts: integer('attempts').notNull().default(1),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profile, t.nodeKey] })],
)

// ── collections ──────────────────────────────────────────────
// Carpetas grandes que arma cada persona (ej. "BIOQUÍMICA SEMESTRE 2") para agrupar sus fuentes.
// Son de cada perfil: Magola puede meter fuentes de Ash en SUS carpetas sin cambiar las de Ash.
export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profile: text('profile').notNull(),
    name: text('name').notNull(),
    color: sourceColor('color').notNull(),
    ...timestamps,
  },
  (t) => [index('collections_profile_idx').on(t.profile)],
)

export const collectionSources = pgTable(
  'collection_sources',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'collection_sources_pk', columns: [t.collectionId, t.sourceId] })],
)

// ── mocca_messages ───────────────────────────────────────────
// Mensajitos que Ian manda desde el panel: Mocca se los dice a Ash en la app (y opcionalmente al celular).
export const moccaMessages = pgTable(
  'mocca_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profile: text('profile').notNull(),
    text: text('text').notNull(),
    mood: text('mood').notNull().default('happy'),
    push: boolean('push').notNull().default(false),
    ...timestamps,
    /** La app lo recibió (al consultar) */
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    /** Mocca se lo mostró */
    seenAt: timestamp('seen_at', { withTimezone: true }),
  },
  (t) => [index('mocca_messages_profile_idx').on(t.profile, t.seenAt)],
)

// ── push_subscriptions ───────────────────────────────────────
// Un registro por celular/navegador que activó los avisos. admin = el del administrador (avisos de premios).
export const pushSubscriptions = pgTable('push_subscriptions', {
  endpoint: text('endpoint').primaryKey(),
  profile: text('profile').notNull(),
  admin: boolean('admin').notNull().default(false),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type UserStats = typeof userStats.$inferSelect
