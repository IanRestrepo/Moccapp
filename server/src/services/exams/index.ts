// Exámenes: armado desde el banco (sin IA), autosave, envío, corrección, repetir y "solo las que fallé".
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import {
  suggestQuestionCount,
  toColombianScore,
  type Answer,
  type CreateExamInput,
  type CreateExamResponse,
  type Difficulty,
  type ExamDTO,
  type ExamHistoryItemDTO,
  type ExamInProgressDTO,
  type ExamResultDTO,
  type QuestionType,
} from '@vetquiz/shared'
import { db } from '../../db/client.js'
import { examAnswers, exams, questionBank, sources, type Exam } from '../../db/schema.js'
import type { GenerationPlan } from '../../ai/schemas.js'
import { AppError, Errors } from '../../lib/errors.js'
import { expandBankOnce, queueExpansion } from '../bank.js'
import { BANK_PROMPT_VERSION } from '../../ai/prompts.js'
import { getSource } from '../sources.js'
import { currentProfile } from '../../lib/profile.js'
import { getStatsRow, localDate, motivationFor, recordCompletedExam, toStatsDTO } from '../gamification.js'
import { gradeAuto, gradeOpenAnswers, isValidAnswer, toPublicQuestion, toReview, type Grade } from './grading.js'
import { LEVEL_MIX, displayPermutation, orderForExam, selectQuestions, type Candidate } from './selection.js'

/** Margen para la latencia del celular: se aceptan respuestas hasta 15 s después del límite */
export const GRACE_MS = 15_000

const log = (msg: string) => console.log(`[exams] ${msg}`)

// ── Armado ───────────────────────────────────────────────────

async function loadCandidates(sourceIds: string[]): Promise<Candidate[]> {
  const bank = await db
    .select({
      id: questionBank.id,
      type: questionBank.type,
      difficulty: questionBank.difficulty,
      topic: questionBank.topic,
      promptVersion: questionBank.promptVersion,
    })
    .from(questionBank)
    .where(inArray(questionBank.sourceId, sourceIds))
  // historial por pregunta de este perfil (en cualquier examen, aunque haya mezclado otras fuentes)
  const history = await db
    .select({ questionId: examAnswers.questionId, credit: examAnswers.credit, at: exams.createdAt })
    .from(examAnswers)
    .innerJoin(exams, eq(exams.id, examAnswers.examId))
    .innerJoin(questionBank, eq(questionBank.id, examAnswers.questionId))
    .where(and(inArray(questionBank.sourceId, sourceIds), eq(exams.profile, currentProfile())))
    .orderBy(asc(exams.createdAt))

  const seen = new Map<string, { times: number; lastCredit: number | null; lastAt: number }>()
  for (const h of history) {
    const prev = seen.get(h.questionId)
    seen.set(h.questionId, { times: (prev?.times ?? 0) + 1, lastCredit: h.credit, lastAt: h.at.getTime() })
  }
  return bank.map(({ promptVersion, ...q }) => {
    const s = seen.get(q.id)
    return {
      ...q,
      timesSeen: s?.times ?? 0,
      lastCredit: s?.lastCredit ?? null,
      lastSeenAt: s?.lastAt ?? null,
      outdated: promptVersion < BANK_PROMPT_VERSION,
    }
  })
}

/** Plan de ampliación: lo que faltó (o la mezcla del nivel si no alcanzó), mínimo 6 por dificultad, máx. 24. */
function expansionPlan(
  missing: Partial<Record<Difficulty, number>>,
  level: CreateExamInput['level'],
  types: QuestionType[],
  nSources = 1,
): GenerationPlan {
  const diffs = Object.keys(missing).length ? Object.keys(missing).map(Number) : Object.keys(LEVEL_MIX[level]).map(Number)
  const per = Math.max(6, Math.floor(24 / diffs.length / nSources))
  const byDifficulty = Object.fromEntries(diffs.map((d) => [d, per])) as GenerationPlan['byDifficulty']
  const total = per * diffs.length
  const byType = Object.fromEntries(types.map((t) => [t, Math.ceil(total / types.length)])) as GenerationPlan['byType']
  return { byDifficulty, byType }
}

async function insertExam(p: {
  sourceIds: string[]
  level: Exam['level']
  types: QuestionType[]
  timeLimitSec: number
  mode: Exam['mode']
  parentExamId?: string
  questionIds: string[]
}): Promise<string> {
  const qs = await db.select({ id: questionBank.id, data: questionBank.data }).from(questionBank).where(inArray(questionBank.id, p.questionIds))
  const dataById = new Map(qs.map((q) => [q.id, q.data]))
  const now = new Date()

  return db.transaction(async (tx) => {
    const [exam] = await tx
      .insert(exams)
      .values({
        sourceId: p.sourceIds[0]!,
        sourceIds: p.sourceIds,
        profile: currentProfile(),
        mode: p.mode,
        parentExamId: p.parentExamId,
        level: p.level,
        questionTypes: p.types,
        questionCount: p.questionIds.length,
        timeLimitSec: p.timeLimitSec,
        startedAt: now,
        // el cronómetro arranca cuando el servidor responde
        deadlineAt: new Date(now.getTime() + p.timeLimitSec * 1000),
      })
      .returning({ id: exams.id })
    await tx.insert(examAnswers).values(
      p.questionIds.map((questionId, position) => {
        const data = dataById.get(questionId)!
        // se baraja en el servidor y se guarda: el cliente nunca recibe la respuesta
        const displayOrder =
          data.type === 'multiple_choice'
            ? displayPermutation(data.options.length)
            : data.type === 'matching'
              ? displayPermutation(data.pairs.length, Math.random, true)
              : null
        return { examId: exam!.id, questionId, position, displayOrder }
      }),
    )
    return exam!.id
  })
}

export async function createExam(input: CreateExamInput): Promise<CreateExamResponse> {
  const ids = [...new Set(input.sourceIds)]
  const list = await Promise.all(ids.map((id) => getSource(id)))
  const notReady = list.filter((src) => src.status !== 'ready')
  if (notReady.length)
    throw Errors.conflict(
      'SOURCE_NOT_READY',
      notReady.length === list.length
        ? 'Esta fuente todavía se está procesando. Espera a que termine.'
        : `"${notReady[0]!.title}" todavía se está procesando. Espera a que termine o quítala del examen.`,
    )
  const types = [...new Set(input.types)]
  const count = input.questionCount ?? suggestQuestionCount(input.timeLimitMin, types, input.level)
  /** Con varias fuentes, cada una genera su parte de lo que falte */
  const expandAll = (missing: Partial<Record<Difficulty, number>>) =>
    Promise.allSettled(ids.map((id) => expandBankOnce(id, expansionPlan(missing, input.level, types, ids.length)))).then(
      (r) => {
        if (r.every((x) => x.status === 'rejected')) throw (r[0] as PromiseRejectedResult).reason
      },
    )
  const queueAll = (missing: Partial<Record<Difficulty, number>>) =>
    ids.forEach((id) => queueExpansion(id, expansionPlan(missing, input.level, types, ids.length)))

  let candidates = await loadCandidates(ids)
  let selection = selectQuestions(candidates, { level: input.level, types, count })
  const missingTotal = Object.values(selection.missingByDifficulty).reduce((a, b) => a + (b ?? 0), 0)
  let bankExpanded = false

  // Falta mucho del nivel pedido (o no alcanza ni con vecinos): se amplía AHORA y ella espera.
  // Falta poco o ya casi todo es repetido: se arma con lo que hay y se amplía en segundo plano.
  if (selection.shortBy > 0 || missingTotal > count * 0.25) {
    try {
      await expandAll(selection.missingByDifficulty)
      bankExpanded = true
      candidates = await loadCandidates(ids)
      selection = selectQuestions(candidates, { level: input.level, types, count })
    } catch (err) {
      if (selection.picked.length < 3) throw err
      log(`no se pudo ampliar; se arma con ${selection.picked.length}`)
    }
  } else if (missingTotal > 0 || selection.unseen < count * 0.5) {
    queueAll(selection.missingByDifficulty)
  }

  // Banco viejo (antes de las reglas nuevas): si salieron preguntas desactualizadas, se generan
  // nuevas del mismo nivel en segundo plano para que el próximo examen ya las tenga
  // (solo mientras haya pocas nuevas de ese nivel, para no llamar a la IA en cada examen)
  const outdatedDiffs = [...new Set(selection.picked.filter((q) => q.outdated).map((q) => q.difficulty))].filter(
    (d) => candidates.filter((c) => c.difficulty === d && !c.outdated && types.includes(c.type)).length < count * 2,
  )
  if (!bankExpanded && outdatedDiffs.length) queueAll(Object.fromEntries(outdatedDiffs.map((d) => [d, 1])))

  if (!selection.picked.length)
    throw Errors.conflict('NO_QUESTIONS', 'Esta fuente no tiene preguntas de esos tipos. Prueba con otros tipos.')

  const examId = await insertExam({
    sourceIds: ids,
    level: input.level,
    types,
    timeLimitSec: input.timeLimitMin * 60,
    mode: 'normal',
    questionIds: orderForExam(selection.picked).map((q) => q.id),
  })
  return { exam: (await getExamDTO(examId)) as ExamInProgressDTO, bankExpanded, shortBy: selection.shortBy }
}

/** "Solo preguntas que fallé": crédito < 1, incluidas las que dejó en blanco. Tiempo proporcional. */
export async function createRetryFailed(examId: string): Promise<CreateExamResponse> {
  const exam = await getExam(examId)
  if (exam.status !== 'completed') throw Errors.conflict('EXAM_NOT_DONE', 'Primero termina este examen.')
  const rows = await db
    .select({ id: questionBank.id, type: questionBank.type, topic: questionBank.topic, difficulty: questionBank.difficulty, credit: examAnswers.credit })
    .from(examAnswers)
    .innerJoin(questionBank, eq(questionBank.id, examAnswers.questionId))
    .where(eq(examAnswers.examId, examId))
  const failed = rows.filter((r) => (r.credit ?? 0) < 1)
  if (!failed.length) throw Errors.conflict('NOTHING_TO_RETRY', '¡No fallaste ninguna! No hay nada que repetir.')

  const minutes = Math.ceil(((exam.timeLimitSec / 60) * failed.length) / rows.length)
  const newId = await insertExam({
    sourceIds: examSourceIds(exam),
    level: exam.level,
    types: [...new Set(failed.map((f) => f.type))],
    timeLimitSec: Math.max(3, minutes) * 60,
    mode: 'retry_failed',
    parentExamId: exam.id,
    questionIds: orderForExam(failed).map((f) => f.id),
  })
  return { exam: (await getExamDTO(newId)) as ExamInProgressDTO, bankExpanded: false, shortBy: 0 }
}

/** "Nuevo examen con la misma fuente": misma configuración; la prioridad trae preguntas que no ha visto. */
export async function createRepeat(examId: string): Promise<CreateExamResponse> {
  const exam = await getExam(examId)
  return createExam({
    sourceIds: examSourceIds(exam),
    level: exam.level,
    timeLimitMin: Math.round(exam.timeLimitSec / 60),
    questionCount: exam.mode === 'normal' ? exam.questionCount : undefined,
    types: exam.questionTypes,
  })
}

// ── Durante el examen ────────────────────────────────────────

async function getExam(id: string): Promise<Exam> {
  const [exam] = await db.select().from(exams).where(and(eq(exams.id, id), eq(exams.profile, currentProfile())))
  if (!exam) throw Errors.notFound('El examen')
  return exam
}

const isOpen = (exam: Exam, now: Date) => exam.status === 'in_progress' && now.getTime() <= exam.deadlineAt.getTime() + GRACE_MS
const closed = () => Errors.conflict('EXAM_CLOSED', 'Este examen ya se envió o se acabó el tiempo.')

async function loadRows(examId: string) {
  return db
    .select({ a: examAnswers, q: questionBank })
    .from(examAnswers)
    .innerJoin(questionBank, eq(questionBank.id, examAnswers.questionId))
    .where(eq(examAnswers.examId, examId))
    .orderBy(asc(examAnswers.position))
}

export async function saveAnswer(
  examId: string,
  questionId: string,
  p: { answer: Answer | null; timeSpentSec?: number },
  now = new Date(),
): Promise<{ saved: true; remainingSec: number }> {
  const exam = await getExam(examId)
  if (!isOpen(exam, now)) throw closed()
  const [row] = await db
    .select({ a: examAnswers, data: questionBank.data })
    .from(examAnswers)
    .innerJoin(questionBank, eq(questionBank.id, examAnswers.questionId))
    .where(and(eq(examAnswers.examId, examId), eq(examAnswers.questionId, questionId)))
  if (!row) throw Errors.notFound('La pregunta')
  if (p.answer && !isValidAnswer(row.data, row.a.displayOrder, p.answer))
    throw new AppError(400, 'INVALID_ANSWER', 'Esa respuesta no corresponde a esta pregunta.')
  await db
    .update(examAnswers)
    .set({ answer: p.answer, answeredAt: now, timeSpentSec: p.timeSpentSec ?? row.a.timeSpentSec })
    .where(eq(examAnswers.id, row.a.id))
  return { saved: true, remainingSec: Math.max(0, Math.round((exam.deadlineAt.getTime() - now.getTime()) / 1000)) }
}

// ── Envío y corrección ───────────────────────────────────────

export async function submitExam(
  examId: string,
  p: { auto: boolean; answers?: { questionId: string; answer: Answer | null }[] },
  now = new Date(),
): Promise<ExamDTO> {
  const exam = await getExam(examId)
  if (exam.status === 'completed') return getExamDTO(examId, now) // doble envío (botón + cronómetro): mismo resultado
  if (exam.status === 'grading') return regradeExam(examId)

  const late = now.getTime() > exam.deadlineAt.getTime() + GRACE_MS
  // Lo que llegó tarde no cuenta: se corrige con lo que alcanzó a guardarse
  if (!late && p.answers?.length) {
    for (const a of p.answers) {
      try {
        await saveAnswer(examId, a.questionId, { answer: a.answer }, now)
      } catch (err) {
        if (!(err instanceof AppError) || err.status >= 500) throw err // respuestas inválidas se ignoran
      }
    }
  }

  // "Reclamo" atómico: si el cronómetro y el botón llegan a la vez, solo uno corrige
  const claimed = await db
    .update(exams)
    .set({
      status: 'grading',
      finishedAt: now > exam.deadlineAt ? exam.deadlineAt : now,
      autoSubmitted: p.auto || late,
    })
    .where(and(eq(exams.id, examId), eq(exams.status, 'in_progress')))
    .returning({ id: exams.id })
  if (!claimed.length) return getExamDTO(examId, now)
  return gradeAndFinalize(examId)
}

export async function regradeExam(examId: string): Promise<ExamDTO> {
  const exam = await getExam(examId)
  if (exam.status === 'completed') return getExamDTO(examId)
  if (exam.status !== 'grading') throw Errors.conflict('EXAM_NOT_SUBMITTED', 'Este examen todavía no se ha enviado.')
  return gradeAndFinalize(examId)
}

async function gradeAndFinalize(examId: string): Promise<ExamResultDTO> {
  const rows = await loadRows(examId)
  const grades = new Map<string, Grade & { by: 'auto' | 'ai' }>()
  const open: typeof rows = []

  for (const r of rows) {
    if (r.a.credit !== null) continue
    const g = gradeAuto(r.q.data, r.a.displayOrder, r.a.answer)
    if (g) grades.set(r.a.id, { ...g, by: 'auto' })
    else open.push(r)
  }

  let pendingError: unknown = null
  if (open.length) {
    try {
      const ai = await gradeOpenAnswers(
        open.map((r) => {
          const d = r.q.data as Extract<typeof r.q.data, { type: 'short_answer' }>
          return {
            questionId: r.a.id,
            prompt: r.q.prompt,
            expectedAnswer: d.expectedAnswer,
            keyPoints: d.keyPoints,
            sourceQuote: r.q.sourceQuote,
            studentAnswer: (r.a.answer as Extract<Answer, { type: 'short_answer' }>).text,
          }
        }),
      )
      for (const [id, g] of ai) grades.set(id, { ...g, by: 'ai' })
    } catch (err) {
      pendingError = err
    }
  }

  // Lo corregido se guarda siempre (la corrección de la IA no se vuelve a pagar)
  for (const [id, g] of grades)
    await db.update(examAnswers).set({ credit: g.credit, feedback: g.feedback, gradedBy: g.by }).where(eq(examAnswers.id, id))

  if (pendingError) {
    for (const r of open) await db.update(examAnswers).set({ feedback: 'Pendiente de corrección' }).where(eq(examAnswers.id, r.a.id))
    log(`corrección pendiente en ${examId.slice(0, 8)}: ${pendingError instanceof AppError ? pendingError.code : pendingError}`)
    throw new AppError(
      503,
      'GRADING_PENDING',
      'Tus respuestas quedaron guardadas, pero la IA está ocupada para corregir las abiertas. Intenta "Corregir de nuevo" en un minuto.',
      true,
    )
  }

  const exam = await getExam(examId)
  const credits = rows.reduce((s, r) => s + (grades.get(r.a.id)?.credit ?? r.a.credit ?? 0), 0)
  const ratio = rows.length ? credits / rows.length : 0
  const score = toColombianScore(ratio)
  const finishedAt = exam.finishedAt ?? new Date()
  const percent = Math.round(ratio * 1000) / 10
  const { xp, bones, streak } = await recordCompletedExam({
    credits,
    level: exam.level,
    score,
    percent,
    questionCount: rows.length,
    finishedAt,
  })

  await db
    .update(exams)
    .set({
      status: 'completed',
      percent,
      score,
      xpEarned: xp,
      bonesEarned: bones,
      timeUsedSec: Math.min(exam.timeLimitSec, Math.round((finishedAt.getTime() - exam.startedAt.getTime()) / 1000)),
    })
    .where(eq(exams.id, examId))

  return (await buildResult(examId, streak)) as ExamResultDTO
}

// ── DTO ──────────────────────────────────────────────────────

const examSourceIds = (exam: Exam) => (exam.sourceIds.length ? exam.sourceIds : [exam.sourceId])

/** "Geopolítica: teorías clásicas" o, con varias fuentes, "Geopolítica: teorías clásicas + 2 más" */
async function titleFor(ids: string[], known?: Map<string, string>): Promise<string> {
  const map = known ?? new Map((await db.select({ id: sources.id, title: sources.title }).from(sources).where(inArray(sources.id, ids))).map((r) => [r.id, r.title]))
  const titles = ids.map((id) => map.get(id)).filter((t): t is string => !!t)
  if (!titles.length) return 'Fuente borrada'
  return titles.length === 1 ? titles[0]! : `${titles[0]} + ${titles.length - 1} más`
}

/** Frase estable por examen (no cambia cada vez que se abre el resultado) */
const seeded = (id: string) => () => (parseInt(id.replace(/-/g, '').slice(0, 8), 16) % 1000) / 1000

async function buildResult(examId: string, streak?: { current: number; extendedToday: boolean }): Promise<ExamResultDTO> {
  const exam = await getExam(examId)
  const sourceTitle = await titleFor(examSourceIds(exam))
  const rows = await loadRows(examId)

  if (!streak) {
    // vista posterior: ¿fue este el examen que abrió la racha de ese día?
    const day = localDate(exam.finishedAt!)
    const sameDay = await db
      .select({ id: exams.id, finishedAt: exams.finishedAt })
      .from(exams)
      .where(and(eq(exams.status, 'completed'), eq(exams.profile, currentProfile())))
      .orderBy(asc(exams.finishedAt))
    const first = sameDay.find((e) => e.finishedAt && localDate(e.finishedAt) === day)
    streak = { current: toStatsDTO(await getStatsRow()).currentStreak, extendedToday: first?.id === exam.id }
  }

  const items = rows.map((r) => {
    const review = toReview(r.q.data, r.a.displayOrder, r.a.answer)
    return {
      questionId: r.q.id,
      position: r.a.position,
      type: r.q.type,
      prompt: r.q.prompt,
      topic: r.q.topic,
      difficulty: r.q.difficulty,
      data: review.data,
      answer: review.answer,
      credit: r.a.credit ?? 0,
      feedback: r.a.feedback,
      explanation: r.q.explanation,
      sourceQuote: r.q.sourceQuote,
      sourceLocation: r.q.sourceLocation,
    }
  })
  return {
    id: exam.id,
    sourceId: exam.sourceId,
    sourceIds: examSourceIds(exam),
    sourceTitle,
    level: exam.level,
    status: 'completed',
    score: exam.score!,
    percent: exam.percent!,
    passed: exam.score! >= 3,
    timeLimitSec: exam.timeLimitSec,
    timeUsedSec: exam.timeUsedSec ?? exam.timeLimitSec,
    autoSubmitted: exam.autoSubmitted,
    xpEarned: exam.xpEarned,
    bonesEarned: exam.bonesEarned,
    streak,
    motivation: motivationFor(exam.score!, seeded(exam.id)),
    items,
    failedCount: items.filter((i) => i.credit < 1).length,
    finishedAt: exam.finishedAt!.toISOString(),
  }
}

export async function getExamDTO(examId: string, now = new Date()): Promise<ExamDTO> {
  let exam = await getExam(examId)
  // Si cerró la pestaña y el tiempo se acabó, al volver el examen ya está enviado con lo guardado
  if (exam.status === 'in_progress' && !isOpen(exam, now)) {
    try {
      return await submitExam(examId, { auto: true }, now)
    } catch (err) {
      if (!(err instanceof AppError) || err.code !== 'GRADING_PENDING') throw err
    }
    exam = await getExam(examId)
  }
  if (exam.status === 'completed') return buildResult(examId)
  if (exam.status === 'grading') return { id: exam.id, sourceId: exam.sourceId, status: 'grading' }

  const rows = await loadRows(examId)
  return {
    id: exam.id,
    sourceId: exam.sourceId,
    sourceIds: examSourceIds(exam),
    sourceTitle: await titleFor(examSourceIds(exam)),
    level: exam.level,
    status: 'in_progress',
    questions: rows.map((r) => toPublicQuestion(r.q, r.a.displayOrder)),
    savedAnswers: Object.fromEntries(rows.map((r) => [r.q.id, r.a.answer])),
    startedAt: exam.startedAt.toISOString(),
    deadlineAt: exam.deadlineAt.toISOString(),
    serverNow: now.toISOString(),
  }
}

// ── Historial ────────────────────────────────────────────────

export async function listHistory(q: { sourceId?: string; cursor?: string; limit: number }): Promise<{ exams: ExamHistoryItemDTO[]; nextCursor: string | null }> {
  const where = and(
    eq(exams.profile, currentProfile()),
    q.sourceId ? sql`(${exams.sourceId} = ${q.sourceId} or ${exams.sourceIds} @> ${JSON.stringify([q.sourceId])}::jsonb)` : undefined,
    q.cursor ? lt(exams.createdAt, new Date(q.cursor)) : undefined,
  )
  const rows = await db
    .select({ e: exams, title: sources.title, color: sources.color })
    .from(exams)
    .innerJoin(sources, eq(sources.id, exams.sourceId))
    .where(where)
    .orderBy(desc(exams.createdAt))
    .limit(q.limit + 1)
  const page = rows.slice(0, q.limit)
  const allIds = [...new Set(page.flatMap(({ e }) => examSourceIds(e)))]
  const titles = new Map(
    allIds.length ? (await db.select({ id: sources.id, title: sources.title }).from(sources).where(inArray(sources.id, allIds))).map((r) => [r.id, r.title]) : [],
  )
  return {
    exams: await Promise.all(page.map(async ({ e, title, color }) => ({
      id: e.id,
      sourceId: e.sourceId,
      sourceTitle: examSourceIds(e).length > 1 ? await titleFor(examSourceIds(e), titles) : title,
      sourceColor: color,
      level: e.level,
      mode: e.mode,
      score: e.score,
      percent: e.percent,
      questionCount: e.questionCount,
      timeUsedSec: e.timeUsedSec,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    }))),
    nextCursor: rows.length > q.limit ? page.at(-1)!.e.createdAt.toISOString() : null,
  }
}
