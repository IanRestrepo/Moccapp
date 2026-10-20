// Exámenes: selección, corrección, nota, XP, racha y rutas. PGlite en memoria + Gemini simulado.
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import type {
  Answer,
  CreateExamResponse,
  ExamDTO,
  ExamHistoryItemDTO,
  ExamInProgressDTO,
  ExamResultDTO,
  PublicQuestion,
  SourceDTO,
  StatsDTO,
} from '@vetquiz/shared'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), 'vetquiz-ex-'))
process.env.RETRY_BASE_MS = '2'

const { setLlm } = await import('../src/ai/gemini.js')
const { GRADING_SYSTEM_PROMPT } = await import('../src/ai/prompts.js')
const { Errors } = await import('../src/lib/errors.js')
const { createApp } = await import('../src/app.js')
const { closeDb } = await import('../src/db/client.js')
const sel = await import('../src/services/exams/selection.js')
const grading = await import('../src/services/exams/grading.js')
const gam = await import('../src/services/gamification.js')
const examsSvc = await import('../src/services/exams/index.js')
const { db: testDb } = await import('../src/db/client.js')
const schema = await import('../src/db/schema.js')
const { eq: dEq } = await import('drizzle-orm')

// ── Doble de Gemini ──────────────────────────────────────────
// Banco: respeta "N de dificultad D" del prompt; tipos y temas en ciclo.
// Respuestas correctas conocidas: MC "COX", V/F "Falso", emparejar a↔1 b↔2 c↔3 d↔4, abierta "Inhibe la COX".

const TOPICS = ['Cronometría dentaria', 'Glándulas salivales', 'Estómago de rumiantes']
const TYPES = ['multiple_choice', 'true_false', 'matching', 'short_answer'] as const
let qn = 0
let bankCalls = 0
let gradingCalls = 0
let gradingBehavior: 'ok' | 'busy' = 'ok'
let inFlight = 0
let maxInFlight = 0

function question(type: (typeof TYPES)[number], difficulty: number) {
  const i = ++qn
  const base = {
    type,
    difficulty,
    topic: TOPICS[i % 3],
    prompt: `Pregunta ${i} de nivel ${difficulty} tipo ${type}: enunciado de prueba`,
    explanation: 'Explicación basada en la fuente para la prueba.',
    sourceQuote: `Cita literal ${i} de los apuntes de clase.`,
    sourceLocation: `Página ${i}`,
    options: [] as string[],
    correctIndex: -1,
    distractorRationales: [] as { optionIndex: number; why: string }[],
    matchingPairs: [] as { left: string; right: string }[],
    expectedAnswer: '',
    keyPoints: [] as string[],
  }
  if (type === 'multiple_choice')
    return { ...base, options: ['COX', 'LOX', 'PLA2', 'MAO'], correctIndex: 0, distractorRationales: [1, 2, 3].map((k) => ({ optionIndex: k, why: `La opción ${k} no es el blanco según la fuente` })) }
  if (type === 'true_false') return { ...base, options: ['Verdadero', 'Falso'], correctIndex: 1, distractorRationales: [{ optionIndex: 0, why: 'La fuente dice lo contrario' }] }
  if (type === 'matching') return { ...base, matchingPairs: ['a', 'b', 'c', 'd'].map((l, k) => ({ left: l, right: String(k + 1) })) }
  return { ...base, expectedAnswer: 'Inhibe la COX', keyPoints: ['COX'] }
}

setLlm({
  async generateJson(p) {
    if (p.system === GRADING_SYSTEM_PROMPT) {
      gradingCalls++
      if (gradingBehavior === 'busy') throw Errors.aiBusy()
      const { respuestas } = JSON.parse(p.prompt) as { respuestas: { questionId: string; studentAnswer: string }[] }
      return {
        results: respuestas.map((r) => ({
          questionId: r.questionId,
          credit: /cox/i.test(r.studentAnswer) ? 1 : /enzima/i.test(r.studentAnswer) ? 0.5 : 0,
          matchedKeyPoints: [],
          feedback: 'Retroalimentación de prueba de la IA.',
        })),
      }
    }
    bankCalls++
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((r) => setTimeout(r, 25))
    inFlight--
    const questions = []
    for (const [, n, d] of p.prompt.matchAll(/(\d+) de dificultad (\d)/g))
      for (let k = 0; k < Number(n); k++) questions.push(question(TYPES[k % 4]!, Number(d)))
    return { title: 'Anatomía digestiva', topics: TOPICS, insufficientContent: false, questions }
  },
  async uploadFile() {
    throw new Error('no usado')
  },
})

// ── Servidor y helpers ───────────────────────────────────────

let base = ''
let server: import('node:http').Server
let sourceId = ''

const api = async <T>(method: string, url: string, body?: unknown): Promise<{ status: number; body: T }> => {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: (await res.json().catch(() => null)) as T }
}

async function waitReady(id: string): Promise<SourceDTO> {
  for (let i = 0; i < 300; i++) {
    const { body } = await api<{ source: SourceDTO }>('GET', `/sources/${id}`)
    if (body.source.status !== 'processing') return body.source
    await new Promise((r) => setTimeout(r, 15))
  }
  throw new Error('timeout')
}

/** La respuesta correcta según lo que se ve en pantalla (como lo haría ella) */
function correctAnswer(q: PublicQuestion): Answer {
  switch (q.type) {
    case 'multiple_choice':
      return { type: q.type, selectedIndex: q.options.indexOf('COX') }
    case 'true_false':
      return { type: q.type, selectedIndex: 1 }
    case 'matching':
      return { type: q.type, matches: q.left.map((_, i) => q.right.indexOf(String(i + 1))) }
    case 'short_answer':
      return { type: q.type, text: 'Los AINEs inhiben la COX' }
  }
}

before(async () => {
  server = createApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  const text = 'Los AINEs inhiben la ciclooxigenasa. '.repeat(12)
  const { body } = await api<{ source: SourceDTO }>('POST', '/sources', { kind: 'text', text })
  const ready = await waitReady(body.source.id)
  assert.equal(ready.bank.total, 48)
  sourceId = ready.id
})
after(async () => {
  server.close()
  await closeDb()
})

// ── Unitarias ────────────────────────────────────────────────

describe('selección (pura)', () => {
  const cand = (id: string, difficulty: 1 | 2 | 3 | 4, extra: Partial<import('../src/services/exams/selection.js').Candidate> = {}) => ({
    id,
    type: 'multiple_choice' as const,
    difficulty,
    topic: 't',
    timesSeen: 0,
    lastCredit: null,
    lastSeenAt: null,
    ...extra,
  })

  test('reparto por mayor residuo suma exacto', () => {
    assert.deepEqual(Object.fromEntries(sel.largestRemainder(20, sel.LEVEL_MIX.utp)), { 3: 6, 4: 14 })
    assert.deepEqual([...sel.largestRemainder(7, sel.LEVEL_MIX.medium)].reduce((s, [, n]) => s + n, 0), 7)
  })

  test('prioridad: nunca vistas → falladas → acertadas (las más antiguas primero)', () => {
    const pool = [
      cand('acertada', 1, { timesSeen: 1, lastCredit: 1, lastSeenAt: 1 }),
      cand('fallada-reciente', 1, { timesSeen: 1, lastCredit: 0, lastSeenAt: 200 }),
      cand('fallada-vieja', 1, { timesSeen: 2, lastCredit: 0.5, lastSeenAt: 100 }),
      cand('nueva', 1),
    ]
    const r = sel.selectQuestions(pool, { level: 'easy', types: ['multiple_choice'], count: 3 })
    assert.deepEqual(r.picked.map((p) => p.id), ['nueva', 'fallada-vieja', 'fallada-reciente'])
    assert.deepEqual(r.missingByDifficulty, {})
    assert.equal(r.shortBy, 0)
    assert.equal(r.unseen, 1)
  })

  test('Fácil es solo nivel 1; si no alcanza, rellena con nivel 2 y lo reporta', () => {
    const pool = [...Array.from({ length: 6 }, (_, k) => cand(`n1-${k}`, 1)), ...Array.from({ length: 6 }, (_, k) => cand(`n2-${k}`, 2))]
    const full = sel.selectQuestions(pool, { level: 'easy', types: ['multiple_choice'], count: 6 })
    assert.ok(full.picked.every((p) => p.difficulty === 1))
    const short = sel.selectQuestions(pool, { level: 'easy', types: ['multiple_choice'], count: 8 })
    assert.equal(short.picked.filter((p) => p.difficulty === 2).length, 2)
    assert.deepEqual(short.missingByDifficulty, { 1: 2 })
  })

  test('las preguntas generadas con reglas viejas van después de todas, aunque nunca hayan salido', () => {
    const pool = [
      cand('vieja-nunca-vista', 1, { outdated: true }),
      cand('nueva-acertada', 1, { timesSeen: 3, lastCredit: 1, lastSeenAt: 5 }),
      cand('nueva-nunca-vista', 1),
    ]
    const r = sel.selectQuestions(pool, { level: 'easy', types: ['multiple_choice'], count: 3 })
    assert.deepEqual(r.picked.map((p) => p.id), ['nueva-nunca-vista', 'nueva-acertada', 'vieja-nunca-vista'])
  })

  test('el prompt trae las reglas de Fácil (un solo dato, sin trampas de "al revés")', async () => {
    const { BANK_SYSTEM_PROMPT, BANK_PROMPT_VERSION } = await import('../src/ai/prompts.js')
    assert.equal(BANK_PROMPT_VERSION, 2)
    assert.match(BANK_SYSTEM_PROMPT, /UN solo dato central/)
    assert.match(BANK_SYSTEM_PROMPT, /maxilar\/mandibular/)
    assert.match(BANK_SYSTEM_PROMPT, /nunca listas de 2 o más/)
  })

  test('reparte los tipos de forma pareja y reporta lo que no alcanzó', () => {
    const pool = TYPES.flatMap((t) => Array.from({ length: 5 }, (_, k) => ({ ...cand(`${t}${k}`, 2), type: t })))
    const r = sel.selectQuestions(pool, { level: 'medium', types: ['multiple_choice', 'true_false', 'matching'], count: 12 })
    const byType = Object.groupBy(r.picked, (p) => p.type)
    assert.deepEqual(Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v!.length])), { multiple_choice: 4, true_false: 4, matching: 4 })
    const short = sel.selectQuestions(pool, { level: 'medium', types: ['matching'], count: 8 })
    assert.equal(short.picked.length, 5)
    assert.equal(short.shortBy, 3)
  })

  test('orden: intercala temas y va de fácil a difícil', () => {
    const items = ['A', 'B', 'C'].flatMap((topic) => [1, 2, 3, 4].map((difficulty) => ({ topic, difficulty })))
    const ordered = sel.orderForExam(items)
    for (let i = 1; i < ordered.length; i++) assert.notEqual(ordered[i]!.topic, ordered[i - 1]!.topic, `temas seguidos en ${i}`)
    assert.equal(ordered[0]!.difficulty, 1)
    assert.equal(ordered.at(-1)!.difficulty, 4)
  })

  test('emparejar nunca queda con la columna derecha en orden correcto', () => {
    for (let k = 0; k < 200; k++) {
      const p = sel.displayPermutation(3, Math.random, true)
      assert.notDeepEqual(p, [0, 1, 2])
    }
  })
})

describe('corrección (pura)', () => {
  const mc = { type: 'multiple_choice' as const, options: ['COX', 'LOX', 'PLA2', 'MAO'], correctIndex: 0, distractorRationales: [{ optionIndex: 2, why: 'La PLA2 actúa antes' }] }

  test('MC con opciones barajadas: traduce el índice mostrado al original', () => {
    const order = [2, 0, 3, 1] // se mostró: PLA2, COX, MAO, LOX
    assert.deepEqual(grading.gradeAuto(mc, order, { type: 'multiple_choice', selectedIndex: 1 }), { credit: 1, feedback: null })
    assert.deepEqual(grading.gradeAuto(mc, order, { type: 'multiple_choice', selectedIndex: 0 }), { credit: 0, feedback: 'La PLA2 actúa antes' })
    assert.equal(grading.gradeAuto(mc, order, null)!.feedback, 'No respondiste esta pregunta.')
  })

  test('emparejar: crédito parcial', () => {
    const m = { type: 'matching' as const, pairs: ['a', 'b', 'c', 'd'].map((l, k) => ({ left: l, right: String(k) })) }
    const id = [0, 1, 2, 3]
    assert.equal(grading.gradeAuto(m, id, { type: 'matching', matches: [0, 1, 2, 3] })!.credit, 1)
    assert.deepEqual(grading.gradeAuto(m, id, { type: 'matching', matches: [0, 1, 3, 2] }), { credit: 0.5, feedback: 'Acertaste 2 de 4 pares.' })
    assert.equal(grading.gradeAuto(m, id, { type: 'matching', matches: [0, 3, 1, -1] })!.credit, 0)
  })

  test('abierta: con texto va a la IA (null); vacía es 0 sin gastar IA', () => {
    const sa = { type: 'short_answer' as const, expectedAnswer: 'x', keyPoints: ['x'] }
    assert.equal(grading.gradeAuto(sa, null, { type: 'short_answer', text: 'algo' }), null)
    assert.equal(grading.gradeAuto(sa, null, { type: 'short_answer', text: '   ' })!.credit, 0)
  })

  test('revisión: MC reordenado y razones en índices mostrados', () => {
    const r = grading.toReview(mc, [2, 0, 3, 1], { type: 'multiple_choice', selectedIndex: 0 })
    assert.deepEqual(r.data, { ...mc, options: ['PLA2', 'COX', 'MAO', 'LOX'], correctIndex: 1, distractorRationales: [{ optionIndex: 0, why: 'La PLA2 actúa antes' }] })
  })
})

describe('XP y racha (pura)', () => {
  test('fecha local de Bogotá (UTC−5)', () => {
    assert.equal(gam.localDate(new Date('2026-10-20T03:00:00Z'), 'America/Bogota'), '2026-10-19')
  })

  test('racha: mismo día, día siguiente, día saltado', () => {
    const s = { currentStreak: 3, longestStreak: 5, lastActiveDate: '2026-10-18' }
    assert.deepEqual(gam.nextStreak(s, '2026-10-18'), { ...s, extendedToday: false })
    assert.deepEqual(gam.nextStreak(s, '2026-10-19'), { currentStreak: 4, longestStreak: 5, lastActiveDate: '2026-10-19', extendedToday: true })
    assert.deepEqual(gam.nextStreak({ ...s, currentStreak: 5 }, '2026-10-20'), { currentStreak: 1, longestStreak: 5, lastActiveDate: '2026-10-20', extendedToday: true })
    assert.equal(gam.nextStreak({ currentStreak: 0, longestStreak: 0, lastActiveDate: null }, '2026-10-19').currentStreak, 1)
  })

  test('XP: créditos × nivel + terminar + nota + racha', () => {
    assert.equal(gam.computeXp({ credits: 18, level: 'utp', score: 4.5, firstOfDay: true, streak: 3 }), 360 + 20 + 25 + 30)
    assert.equal(gam.computeXp({ credits: 0, level: 'easy', score: 0, firstOfDay: false, streak: 9 }), 20)
    assert.equal(gam.computeXp({ credits: 10, level: 'medium', score: 5, firstOfDay: true, streak: 30 }), 125 + 20 + 50 + 70)
  })
})

// ── De punta a punta ─────────────────────────────────────────

describe('examen completo por HTTP', () => {
  let exam1: ExamInProgressDTO
  let result1: ExamResultDTO
  let exam2Id = ''

  test('armar: Parcial UTP de 20; sin respuestas filtradas; cronómetro desde el servidor', async () => {
    const before = bankCalls
    const { status, body } = await api<CreateExamResponse>('POST', '/exams', {
      sourceIds: [sourceId],
      level: 'utp',
      timeLimitMin: 30,
      questionCount: 20,
      types: ['multiple_choice', 'true_false', 'matching', 'short_answer'],
    })
    assert.equal(status, 201)
    exam1 = body.exam
    assert.equal(exam1.questions.length, 20)
    assert.equal(body.bankExpanded, false, 'faltan solo 2 de nivel 4: no se hace esperar a nadie')
    assert.equal(body.shortBy, 0)
    const raw = JSON.stringify(body)
    for (const leak of ['correctIndex', 'expectedAnswer', 'keyPoints', 'pairs', 'explanation', 'sourceQuote'])
      assert.ok(!raw.includes(leak), `se filtró ${leak}`)
    const ms = new Date(exam1.deadlineAt).getTime() - new Date(exam1.startedAt).getTime()
    assert.equal(ms, 30 * 60_000)
    // como faltaron 2 de nivel 4, se amplía en segundo plano para el próximo examen
    for (let i = 0; i < 100 && bankCalls === before; i++) await new Promise((r) => setTimeout(r, 10))
    assert.equal(bankCalls, before + 1)
  })

  test('autosave: valida tipo e índices', async () => {
    const mc = exam1.questions.find((q) => q.type === 'multiple_choice')!
    const ok = await api<{ saved: boolean; remainingSec: number }>('PUT', `/exams/${exam1.id}/answers/${mc.id}`, { answer: correctAnswer(mc), timeSpentSec: 12 })
    assert.equal(ok.status, 200)
    assert.ok(ok.body.remainingSec > 1700)
    assert.equal((await api('PUT', `/exams/${exam1.id}/answers/${mc.id}`, { answer: { type: 'multiple_choice', selectedIndex: 9 } })).status, 400)
    assert.equal((await api('PUT', `/exams/${exam1.id}/answers/${mc.id}`, { answer: { type: 'short_answer', text: 'x' } })).status, 400)
    const reloaded = await api<{ exam: ExamInProgressDTO }>('GET', `/exams/${exam1.id}`)
    assert.deepEqual(reloaded.body.exam.savedAnswers[mc.id], correctAnswer(mc))
  })

  test('enviar todo bien: nota 5.0, XP, racha y revisión coherente', async () => {
    const gradingBefore = gradingCalls
    const answers = exam1.questions.map((q) => ({ questionId: q.id, answer: correctAnswer(q) }))
    const { status, body } = await api<{ result: ExamResultDTO }>('POST', `/exams/${exam1.id}/submit`, { answers })
    assert.equal(status, 200)
    result1 = body.result
    assert.equal(result1.status, 'completed')
    assert.equal(result1.score, 5)
    assert.equal(result1.percent, 100)
    assert.equal(result1.passed, true)
    assert.equal(result1.failedCount, 0)
    assert.equal(gradingCalls - gradingBefore, 1, 'todas las abiertas en UNA llamada')
    assert.deepEqual(result1.streak, { current: 1, extendedToday: true })
    const credits = 20
    assert.equal(result1.xpEarned, 10 * credits * 2 + 20 + 50 + 10)
    assert.equal(result1.bonesEarned, 5 + 20 + 10 + 25 + 3, 'huesitos: terminar + 20 correctas + nota + perfecto + racha')
    assert.ok(result1.motivation.length > 5)
    for (const it of result1.items) {
      if (it.data.type === 'multiple_choice' && it.answer?.type === 'multiple_choice')
        assert.equal(it.answer.selectedIndex, it.data.correctIndex, 'índices de revisión coherentes')
      if (it.answer?.type === 'matching') assert.deepEqual(it.answer.matches, [0, 1, 2, 3])
      assert.ok(it.sourceQuote && it.explanation)
    }
  })

  test('doble envío (botón + cronómetro) devuelve lo mismo y no duplica XP', async () => {
    const again = await api<{ result: ExamResultDTO }>('POST', `/exams/${exam1.id}/submit`, { auto: true })
    assert.equal(again.body.result.score, 5)
    const stats = await api<{ stats: StatsDTO }>('GET', '/stats')
    assert.equal(stats.body.stats.totalXp, result1.xpEarned)
    assert.equal(stats.body.stats.examsCompleted, 1)
  })

  test('examen en blanco: 0.0, sin gastar IA, XP solo por terminar', async () => {
    const created = await api<CreateExamResponse>('POST', '/exams', { sourceIds: [sourceId], level: 'easy', timeLimitMin: 10, questionCount: 8, types: ['multiple_choice', 'short_answer'] })
    exam2Id = created.body.exam.id
    const gradingBefore = gradingCalls
    const { body } = await api<{ result: ExamResultDTO }>('POST', `/exams/${exam2Id}/submit`, {})
    assert.equal(body.result.score, 0)
    assert.equal(body.result.passed, false)
    assert.equal(body.result.failedCount, 8)
    assert.equal(gradingCalls, gradingBefore)
    assert.equal(body.result.xpEarned, 20, 'mismo día: sin bono de racha')
    assert.deepEqual(body.result.streak, { current: 1, extendedToday: false })
    assert.ok(body.result.items.every((i) => i.feedback === 'No respondiste esta pregunta.'))
  })

  test('"solo las que fallé": mismas preguntas, tiempo proporcional; si no falló ninguna → 409', async () => {
    const { status, body } = await api<CreateExamResponse>('POST', `/exams/${exam2Id}/retry-failed`)
    assert.equal(status, 201)
    assert.equal(body.exam.questions.length, 8)
    const ms = new Date(body.exam.deadlineAt).getTime() - new Date(body.exam.startedAt).getTime()
    assert.equal(ms, 10 * 60_000)
    const none = await api<{ error: { code: string } }>('POST', `/exams/${exam1.id}/retry-failed`)
    assert.equal(none.status, 409)
    assert.equal(none.body.error.code, 'NOTHING_TO_RETRY')
  })

  test('"nuevo examen con la misma fuente" prioriza preguntas que no ha visto', async () => {
    const { body } = await api<CreateExamResponse>('POST', `/exams/${exam1.id}/repeat`)
    const seen = new Set(exam1.questions.map((q) => q.id))
    const repeated = body.exam.questions.filter((q) => seen.has(q.id)).length
    assert.equal(body.exam.questions.length, 20)
    assert.ok(repeated <= 6, `repitió ${repeated} de 20`)
  })

  test('falta mucho de un tipo → amplía el banco ANTES de armar (bankExpanded)', async () => {
    const before = bankCalls
    const { body } = await api<CreateExamResponse>('POST', '/exams', { sourceIds: [sourceId], level: 'hard', timeLimitMin: 60, questionCount: 40, types: ['short_answer'] })
    assert.equal(body.bankExpanded, true)
    // puede reutilizar una ampliación que ya estaba en curso (vuelo único): no siempre hay llamada nueva
    assert.ok(bankCalls >= before)
    assert.equal(body.exam.questions.length + body.shortBy, 40)
    assert.ok(body.exam.questions.every((q) => q.type === 'short_answer'))
  })

  test('IA caída al corregir abiertas: respuestas guardadas, 503 amable y "corregir de nuevo" funciona', async () => {
    const created = await api<CreateExamResponse>('POST', '/exams', { sourceIds: [sourceId], level: 'medium', timeLimitMin: 10, questionCount: 4, types: ['short_answer'] })
    const id = created.body.exam.id
    const answers = created.body.exam.questions.map((q, i) => ({ questionId: q.id, answer: { type: 'short_answer' as const, text: i === 0 ? 'Es una enzima' : 'Inhibe la COX' } }))
    gradingBehavior = 'busy'
    const failed = await api<{ error: { code: string; message: string; retryable: boolean } }>('POST', `/exams/${id}/submit`, { answers })
    assert.equal(failed.status, 503)
    assert.equal(failed.body.error.code, 'GRADING_PENDING')
    assert.equal(failed.body.error.retryable, true)
    assert.equal((await api<{ exam: ExamDTO }>('GET', `/exams/${id}`)).body.exam.status, 'grading')

    gradingBehavior = 'ok'
    const ok = await api<{ result: ExamResultDTO }>('POST', `/exams/${id}/regrade`)
    assert.equal(ok.status, 200)
    assert.equal(ok.body.result.percent, 87.5) // 0.5 + 1 + 1 + 1 de 4
    assert.equal(ok.body.result.score, 4.4)
    assert.equal(ok.body.result.items[0]!.feedback, 'Retroalimentación de prueba de la IA.')
  })

  test('historial con paginación por cursor', async () => {
    const p1 = await api<{ exams: ExamHistoryItemDTO[]; nextCursor: string | null }>('GET', `/exams?limit=2&sourceId=${sourceId}`)
    assert.equal(p1.body.exams.length, 2)
    assert.ok(p1.body.nextCursor)
    const p2 = await api<{ exams: ExamHistoryItemDTO[] }>('GET', `/exams?limit=50&cursor=${encodeURIComponent(p1.body.nextCursor!)}`)
    const ids = new Set(p1.body.exams.map((e) => e.id))
    assert.ok(p2.body.exams.length >= 3)
    assert.ok(p2.body.exams.every((e) => !ids.has(e.id)))
    assert.equal(p1.body.exams[0]!.sourceTitle, 'Anatomía digestiva')
  })

  test('stats: semana, nivel y preferencia de sonido', async () => {
    const { body } = await api<{ stats: StatsDTO }>('GET', '/stats')
    assert.equal(body.stats.week.length, 7)
    assert.equal(body.stats.week.at(-1)!.active, true)
    assert.equal(body.stats.studiedToday, true)
    assert.equal(body.stats.currentStreak, 1)
    assert.ok(body.stats.level >= 2)
    const patched = await api<{ stats: StatsDTO }>('PATCH', '/stats', { soundEnabled: false })
    assert.equal(patched.body.stats.soundEnabled, false)
  })
})

describe('varias fuentes', () => {
  test('nunca hay más de 2 fuentes generándose a la vez (cada una hace 2 llamadas)', async () => {
    maxInFlight = 0
    const created = await Promise.all(
      ['Geopolítica 1', 'Geopolítica 2', 'Geopolítica 3'].map((t, i) =>
        api<{ source: SourceDTO }>('POST', '/sources', { kind: 'text', title: t, text: `Teoría del Heartland y del Rimland número ${i}. `.repeat(10) }),
      ),
    )
    const ids = created.map((c) => c.body.source.id)
    for (const id of ids) assert.equal((await waitReady(id)).status, 'ready')
    assert.ok(maxInFlight <= 4, `llamadas simultáneas: ${maxInFlight}`)
    assert.ok(maxInFlight >= 2)
    multiIds = ids
  })

  let multiIds: string[] = []
  test('un examen con varias fuentes mezcla preguntas de todas y se titula "+ N más"', async () => {
    const { status, body } = await api<CreateExamResponse>('POST', '/exams', {
      sourceIds: multiIds,
      level: 'medium',
      timeLimitMin: 30,
      questionCount: 18,
      types: ['multiple_choice', 'true_false'],
    })
    assert.equal(status, 201)
    assert.equal(body.exam.questions.length, 18)
    assert.deepEqual(body.exam.sourceIds, multiIds)
    assert.equal(body.exam.sourceTitle, 'Geopolítica 1 + 2 más')
    const rows = await testDb
      .select({ src: schema.questionBank.sourceId })
      .from(schema.examAnswers)
      .innerJoin(schema.questionBank, dEq(schema.questionBank.id, schema.examAnswers.questionId))
      .where(dEq(schema.examAnswers.examId, body.exam.id))
    assert.equal(new Set(rows.map((r) => r.src)).size, 3, 'trae preguntas de las 3 fuentes')

    const hist = await api<{ exams: ExamHistoryItemDTO[] }>('GET', `/exams?sourceId=${multiIds[2]}`)
    assert.ok(hist.body.exams.some((e) => e.id === body.exam.id && e.sourceTitle === 'Geopolítica 1 + 2 más'), 'el historial lo encuentra por cualquiera de sus fuentes')
  })

  test('si una de las fuentes sigue procesando, avisa cuál', async () => {
    const pending = await api<{ source: SourceDTO }>('POST', '/sources', { kind: 'text', title: 'Todavía no', text: 'Contenido que aún se procesa. '.repeat(12) })
    const res = await api<{ error: { message: string } }>('POST', '/exams', {
      sourceIds: [multiIds[0], pending.body.source.id],
      level: 'medium',
      timeLimitMin: 10,
      types: ['multiple_choice'],
    })
    assert.equal(res.status, 409)
    assert.match(res.body.error.message, /"Todavía no" todavía se está procesando/)
    await waitReady(pending.body.source.id)
  })
})

describe('tiempo (servicio con reloj controlado)', () => {
  test('después del límite + 15 s no se aceptan respuestas, y al volver ya está enviado con lo guardado', async () => {
    const { exam } = await examsSvc.createExam({ sourceIds: [sourceId], level: 'easy', timeLimitMin: 3, questionCount: 4, types: ['true_false'] })
    const deadline = new Date(exam.deadlineAt).getTime()
    const [q1, q2] = exam.questions
    // a tiempo (dentro del margen de gracia)
    await examsSvc.saveAnswer(exam.id, q1!.id, { answer: { type: 'true_false', selectedIndex: 1 } }, new Date(deadline + 10_000))
    // tarde
    await assert.rejects(
      examsSvc.saveAnswer(exam.id, q2!.id, { answer: { type: 'true_false', selectedIndex: 1 } }, new Date(deadline + 20_000)),
      /ya se envió o se acabó el tiempo/,
    )
    const later = (await examsSvc.getExamDTO(exam.id, new Date(deadline + 3600_000))) as ExamResultDTO
    assert.equal(later.status, 'completed')
    assert.equal(later.autoSubmitted, true)
    assert.equal(later.timeUsedSec, 180)
    assert.equal(later.percent, 25)
  })
})
