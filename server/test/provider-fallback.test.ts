import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withProviderFallback } from '../src/ai/provider-fallback.js'
import { createCloudflareLlm } from '../src/ai/cloudflare.js'
import { AppError } from '../src/lib/errors.js'
import type { Llm, GenerateJsonParams } from '../src/ai/gemini.js'
const params: GenerateJsonParams = { system: 'Sistema', source: [{ text: 'Fuente' }], prompt: 'Pregunta', temperature: 0, jsonSchema: { type: 'object' } }
const llm = (fn: Llm['generateJson']): Llm => ({ generateJson: fn, async uploadFile() { throw Error('no usado') } })

test('Gemini es siempre principal; Cloudflare solo ante indisponibilidad y con recuperación', async () => {
  let now = 1000, primary = 0, backup = 0, down = false
  const ai = withProviderFallback(llm(async () => { primary++; if (down) throw new AppError(402, 'AI_CREDITS_EXHAUSTED', 'sin saldo'); return { provider: 'gemini' } }), llm(async () => { backup++; return { provider: 'cloudflare' } }), () => now)
  assert.deepEqual(await ai.generateJson(params), { provider: 'gemini' })
  assert.equal(backup, 0)
  down = true
  await ai.generateJson(params)
  await ai.generateJson(params)
  assert.equal(primary, 2)
  assert.equal(backup, 2)
  now += 300_001; down = false
  assert.deepEqual(await ai.generateJson(params), { provider: 'gemini' })
})
test('no evade rechazos de contenido ni errores de fuente', async () => {
  for (const code of ['AI_BLOCKED', 'VIDEO_UNAVAILABLE', 'SOURCE_TOO_LARGE']) {
    const ai = withProviderFallback(llm(async () => { throw new AppError(422, code, 'rechazo') }), llm(async () => { assert.fail('no llamar respaldo') }))
    await assert.rejects(ai.generateJson(params), (e: any) => e.code === code)
  }
})
test('Cloudflare convierte PDF, reutiliza conversión y mantiene JSON estructurado', async () => {
  let conversions = 0, generations = 0
  const fetcher = (async (url: string | URL | Request, init: RequestInit) => {
    if (String(url).endsWith('/tomarkdown')) { conversions++; return Response.json({ success: true, result: [{ format: 'markdown', data: 'El ovario produce ovocitos.' }] }) }
    generations++
    const body = JSON.parse(init.body as string)
    assert.match(body.messages[1].content, /ovocitos/)
    assert.equal(body.response_format.type, 'json_schema')
    return Response.json({ success: true, result: { response: { answer: 'Ovario' } } })
  }) as typeof fetch
  const ai = createCloudflareLlm({token:'test',accountId:'a'.repeat(32),model:'test'},fetcher)
  const input = { ...params, source: [{ inlineData: { data: Buffer.from('PDF').toString('base64'), mimeType: 'application/pdf' } }] }
  await ai.generateJson(input); await ai.generateJson(input)
  assert.equal(conversions, 1); assert.equal(generations, 2)
  await assert.rejects(ai.generateJson({...params,source:[{fileData:{fileUri:'https://youtube.com/watch?v=test'}}]}), (e:any) => e.code === 'AI_FALLBACK_UNSUPPORTED')
  await assert.rejects(ai.generateJson({...params,source:[{text:'x'.repeat(46_000)}]}), (e:any) => e.code === 'AI_BACKUP_CONTEXT')
})
test('el respaldo respeta 429 y no repite solicitudes durante la espera', async () => {
  let calls = 0
  const ai = createCloudflareLlm({token:'test',accountId:'a'.repeat(32),model:'test'}, (async () => { calls++; return new Response('', {status:429, headers:{'retry-after':'60'}}) }) as typeof fetch)
  for (let i=0;i<2;i++) await assert.rejects(ai.generateJson(params), (e:any) => e.code === 'AI_BACKUP_QUOTA')
  assert.equal(calls, 1)
})
