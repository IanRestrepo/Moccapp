// Código de acceso (solo en la nube): bloquea la API, deja entrar con el código correcto y frena a quien adivine.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.ACCESS_CODE = 'mocca-secreta-123'

const { createApp } = await import('../src/app.js')
const { closeDb } = await import('../src/db/client.js')

let base = ''
let server: import('node:http').Server
before(async () => {
  server = createApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})
after(async () => {
  server.close()
  await closeDb()
})

const enter = (code: string) =>
  fetch(`${base}/access`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.9' }, body: JSON.stringify({ code }) })

test('sin código: salud responde, el resto de la API pide acceso', async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200)
  const res = await fetch(`${base}/sources`)
  assert.equal(res.status, 401)
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'ACCESS_REQUIRED')
  assert.deepEqual(await (await fetch(`${base}/access`)).json(), { required: true, granted: false, profile: null, owner: false, name: null, blobUploads: false })
})

test('código correcto: cookie httpOnly que abre la API; una cookie inventada no sirve', async () => {
  const res = await enter('mocca-secreta-123')
  assert.equal(res.status, 200)
  const cookie = res.headers.get('set-cookie')!
  assert.match(cookie, /vq_access=ash\.[a-f0-9]{64}/)
  assert.match(cookie, /HttpOnly/i)
  const value = cookie.split(';')[0]!
  assert.equal((await fetch(`${base}/sources`, { headers: { cookie: value } })).status, 200)
  assert.equal((await fetch(`${base}/sources`, { headers: { cookie: 'vq_access=' + 'a'.repeat(64) } })).status, 401)
})

test('10 intentos fallidos seguidos → 429 por un rato', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await enter(`malo-${i}`)).status, 401)
  assert.equal((await enter('mocca-secreta-123')).status, 429)
})
