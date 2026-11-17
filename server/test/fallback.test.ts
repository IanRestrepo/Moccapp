// Respaldo de modelos: la cuota gratis de Gemini es por modelo; si uno se agota o se satura, se usa el siguiente.
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { ApiError } from '@google/genai'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
const { withModelFallback, resetModelBlocks, classifyGeminiError } = await import('../src/ai/gemini.js')

const quota = () => new ApiError({ status: 429, message: '{"error":{"code":429,"message":"You exceeded your current quota","details":[{"retryDelay": "60s"}]}}' })
const busy = () => new ApiError({ status: 503, message: 'This model is currently experiencing high demand' })
const MODELS = ['principal', 'respaldo-1', 'respaldo-2']
beforeEach(() => resetModelBlocks())

test('sin cuota en el principal → usa el respaldo y no vuelve a intentar el principal hasta que se reinicie', async () => {
  const calls: string[] = []
  let now = 1_000
  const call = async (m: string) => {
    calls.push(m)
    if (m === 'principal') throw quota()
    return `ok:${m}`
  }
  assert.deepEqual(await withModelFallback(MODELS, call, () => now), { result: 'ok:respaldo-1', model: 'respaldo-1' })
  await withModelFallback(MODELS, call, () => now)
  assert.deepEqual(calls, ['principal', 'respaldo-1', 'respaldo-1'], 'el principal quedó bloqueado')
  now += 61_000 // pasó el retryDelay
  await withModelFallback(MODELS, call, () => now)
  assert.equal(calls.at(-2), 'principal', 'después del reinicio lo vuelve a intentar')
})

test('saturado (503) → prueba el siguiente sin bloquear al principal', async () => {
  const calls: string[] = []
  let first = true
  const call = async (m: string) => {
    calls.push(m)
    if (m === 'principal' && first) {
      first = false
      throw busy()
    }
    return m
  }
  assert.equal((await withModelFallback(MODELS, call)).model, 'respaldo-1')
  assert.equal((await withModelFallback(MODELS, call)).model, 'principal')
})

test('errores que no son de cuota ni saturación no cambian de modelo', async () => {
  const calls: string[] = []
  await assert.rejects(
    withModelFallback(MODELS, async (m) => {
      calls.push(m)
      throw new ApiError({ status: 400, message: 'API key not valid' })
    }),
  )
  assert.deepEqual(calls, ['principal'])
})

test('todos sin cuota → mensaje claro de cuota agotada', async () => {
  const err = await withModelFallback(MODELS, async () => {
    throw quota()
  }).catch((e) => e)
  const app = classifyGeminiError(err)
  assert.equal(app.code, 'AI_QUOTA')
  assert.match(app.message, /límite de cuota/)
})

test('todos bloqueados: recargar no consume nuevas llamadas y respeta retryDelay', async () => {
  let calls = 0
  let now = 1000
  const call = async () => { calls++; throw quota() }
  await assert.rejects(withModelFallback(MODELS, call, () => now))
  assert.equal(calls, 3)
  const error = await withModelFallback(MODELS, call, () => now).catch(e => e)
  assert.equal(classifyGeminiError(error).code, 'AI_QUOTA')
  assert.equal(calls, 3)
  assert.doesNotMatch(error.message, /por hoy|en unas horas|facturación/)
  now += 61000
  await assert.rejects(withModelFallback(MODELS, call, () => now))
  assert.equal(calls, 6)
})

test('saldo prepago agotado (402) se informa sin culpar al archivo ni cambiar de modelo', async () => {
  let calls = 0
  const raw = await withModelFallback(MODELS, async () => {
    calls++
    throw new ApiError({ status: 402, message: 'Your prepayment credits are depleted.' })
  }).catch(e => e)
  const error = classifyGeminiError(raw)
  assert.equal(error.code, 'AI_CREDITS_EXHAUSTED')
  assert.equal(error.status, 402)
  assert.equal(error.retryable, false)
  assert.equal(calls, 1)
  assert.match(error.message, /créditos de Gemini/)
  assert.doesNotMatch(error.message, /otro archivo|por hoy|unas horas/)
})
