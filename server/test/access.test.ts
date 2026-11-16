// Entrada con usuario y contraseña: la primera vez con el código (y se crea el usuario), después usuario y contraseña.
// El código queda para recuperar la contraseña. Frena a quien adivine.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.PROFILE_CODES = 'ash:codigo-ash-456,magola:codigo-magola-789'

const { createApp } = await import('../src/app.js')
const { db, closeDb } = await import('../src/db/client.js')
const { accounts } = await import('../src/db/schema.js')

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

let ip = 1
const post = async (path: string, body: unknown, cookie = '', sameIp = false) => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.1.0.${sameIp ? 250 : ip++}`, cookie },
    body: JSON.stringify(body),
  })
  return { res, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '', body: (await res.json()) as Record<string, unknown> }
}
const get = (path: string, cookie = '') => fetch(`${base}${path}`, { headers: { cookie } })

test('sin entrar: salud responde, el resto de la API pide acceso', async () => {
  assert.equal((await get('/health')).status, 200)
  const res = await get('/sources')
  assert.equal(res.status, 401)
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'ACCESS_REQUIRED')
  const status = await (await get('/access')).json()
  assert.equal(status.required, true)
  assert.equal(status.granted, false)
})

test('primera vez: con el código entra solo a crear su usuario; después la API se abre', async () => {
  const code = await post('/access/code', { code: ' Codigo-Ash-456 ' })
  assert.equal(code.res.status, 200)
  assert.equal(code.body.needsAccount, true)
  assert.equal(code.body.granted, false)
  // con solo el código no puede usar la app
  const blocked = await get('/sources', code.cookie)
  assert.equal(blocked.status, 401)
  assert.equal(((await blocked.json()) as { error: { code: string } }).error.code, 'ACCOUNT_REQUIRED')

  assert.equal((await post('/access/setup', { username: 'a', password: '123456' }, code.cookie)).res.status, 400)
  assert.equal((await post('/access/setup', { username: 'ashley', password: '123' }, code.cookie)).res.status, 400)
  const setup = await post('/access/setup', { username: 'Ashley', password: 'mocca-linda' }, code.cookie)
  assert.equal(setup.res.status, 200)
  assert.equal(setup.body.granted, true)
  assert.equal(setup.body.username, 'ashley')
  assert.match(setup.res.headers.get('set-cookie')!, /HttpOnly/i)
  assert.equal((await get('/sources', setup.cookie)).status, 200)

  // la contraseña no se guarda en claro
  const [row] = await db.select().from(accounts)
  assert.match(row!.passwordHash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/)
  assert.ok(!row!.passwordHash.includes('mocca-linda'))

  // la cookie del código ya no sirve, y el código ya no abre otra cuenta
  assert.equal((await get('/sources', code.cookie)).status, 401)
  assert.equal((await post('/access/code', { code: 'codigo-ash-456' })).res.status, 409)
})

test('usuario y contraseña: entra con los buenos, no con los malos; el usuario no distingue mayúsculas', async () => {
  const ok = await post('/access/login', { username: ' ASHLEY ', password: 'mocca-linda' })
  assert.equal(ok.res.status, 200)
  assert.equal(ok.body.profile, 'ash')
  assert.equal((await get('/sources', ok.cookie)).status, 200)
  assert.equal((await post('/access/login', { username: 'ashley', password: 'otra-cosa' })).res.status, 401)
  assert.equal((await post('/access/login', { username: 'nadie', password: 'mocca-linda' })).res.status, 401)
  // una cookie inventada no sirve
  assert.equal((await get('/sources', ok.cookie.replace('acct.ash.', 'acct.magola.'))).status, 401)
})

test('el usuario de otra persona no se puede repetir', async () => {
  const code = await post('/access/code', { code: 'codigo-magola-789' })
  const dup = await post('/access/setup', { username: 'ashley', password: 'otra-clave' }, code.cookie)
  assert.equal(dup.res.status, 409)
  assert.equal((await post('/access/setup', { username: 'magola', password: 'otra-clave' }, code.cookie)).res.status, 200)
})

test('olvidó la contraseña: con su código pone una nueva y los otros dispositivos salen', async () => {
  const before = await post('/access/login', { username: 'ashley', password: 'mocca-linda' })
  assert.equal((await post('/access/reset', { code: 'malo-123', password: 'nueva-clave' })).res.status, 401)
  const reset = await post('/access/reset', { code: 'codigo-ash-456', password: 'nueva-clave' })
  assert.equal(reset.res.status, 200)
  assert.equal(reset.body.granted, true)
  assert.equal((await get('/sources', reset.cookie)).status, 200)
  assert.equal((await get('/sources', before.cookie)).status, 401)
  assert.equal((await post('/access/login', { username: 'ashley', password: 'mocca-linda' })).res.status, 401)
  assert.equal((await post('/access/login', { username: 'ashley', password: 'nueva-clave' })).res.status, 200)
})

test('cambiar la contraseña desde adentro pide la actual', async () => {
  const s = await post('/access/login', { username: 'magola', password: 'otra-clave' })
  assert.equal((await post('/access/password', { current: 'mal', password: 'clave-nueva' }, s.cookie)).res.status, 401)
  const ch = await post('/access/password', { current: 'otra-clave', password: 'clave-nueva' }, s.cookie)
  assert.equal(ch.res.status, 200)
  assert.equal((await get('/sources', ch.cookie)).status, 200)
  assert.equal((await post('/access/login', { username: 'magola', password: 'clave-nueva' })).res.status, 200)
})

test('salir borra la cookie', async () => {
  const out = await post('/access/logout', {})
  assert.match(out.res.headers.get('set-cookie')!, /vq_access=;/)
})

test('el administrador ve las cuentas y le pone contraseña nueva a una persona (sin tener cuenta en la app)', async () => {
  const put = (profile: string, body: unknown) =>
    fetch(`${base}/admin/accounts/${profile}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const list = (await (await get('/admin/accounts')).json()).accounts
  assert.deepEqual(list.map((a: { username: string }) => a.username), ['ashley', 'magola'])
  assert.equal((await put('nadie', { password: 'Clave-Admin1' })).status, 404)
  assert.equal((await put('ash', { password: '123' })).status, 400)
  assert.equal((await put('ash', { username: 'magola', password: 'Clave-Admin1' })).status, 409)
  const before = await post('/access/login', { username: 'ashley', password: 'nueva-clave' })
  assert.equal((await put('ash', { password: 'Clave-Admin1' })).status, 200)
  // la contraseña distingue mayúsculas; los dispositivos con la vieja salen
  assert.equal((await post('/access/login', { username: 'ashley', password: 'clave-admin1' })).res.status, 401)
  assert.equal((await post('/access/login', { username: 'ashley', password: 'Clave-Admin1' })).res.status, 200)
  assert.equal((await get('/sources', before.cookie)).status, 401)
})

test('10 intentos fallidos seguidos → 429 por un rato', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await post('/access/login', { username: 'ashley', password: `malo-${i}` }, '', true)).res.status, 401)
  assert.equal((await post('/access/login', { username: 'ashley', password: 'nueva-clave' }, '', true)).res.status, 429)
})
