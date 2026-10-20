// En producción la página de administrador exige ADMIN_CODE (si no, Ashley podría regalarse huesitos).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.NODE_ENV = 'production'
process.env.ADMIN_CODE = 'admin-secreto-123'

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

test('sin cookie de administrador no se puede regalar huesitos ni ver la administración', async () => {
  const res = await fetch(`${base}/admin/bones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"amount":9999}' })
  assert.equal(res.status, 401)
  assert.equal((await fetch(`${base}/admin/rewards`)).status, 401)
  assert.deepEqual(await (await fetch(`${base}/admin/status`)).json(), { required: true, granted: false, disabled: false })
})

test('con el código correcto entra (cookie httpOnly) y Ashley sigue viendo sus premios sin código', async () => {
  const wrong = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"code":"nop"}' })
  assert.equal(wrong.status, 401)
  const ok = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"code":"admin-secreto-123"}' })
  assert.equal(ok.status, 200)
  const cookie = ok.headers.get('set-cookie')!.split(';')[0]!
  assert.equal((await fetch(`${base}/admin/rewards`, { headers: { cookie } })).status, 200)
  assert.equal((await fetch(`${base}/rewards`)).status, 200)
})
