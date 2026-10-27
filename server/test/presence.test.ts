// Panel del administrador: saber si Ashley está usando la app y cuándo fue la última vez.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.NODE_ENV = 'production'
process.env.ADMIN_CODE = 'admin-secreto-123'

const { createApp } = await import('../src/app.js')
const { closeDb } = await import('../src/db/client.js')
const { getPresence, resetPresence, deviceFrom, ONLINE_WINDOW_MS } = await import('../src/services/presence.js')

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
let base = ''
let admin = ''
let server: import('node:http').Server
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

before(async () => {
  server = createApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  const ok = await post('/admin/login', { code: 'admin-secreto-123' })
  admin = ok.headers.get('set-cookie')!.split(';')[0]!
})
after(async () => {
  server.close()
  await closeDb()
})

test('sin señales: no está en línea y no hay última vez', async () => {
  const res = await fetch(`${base}/admin/presence`, { headers: { cookie: admin } })
  assert.deepEqual((await res.json()).people, [{ profile: 'ash', name: 'Ashley', online: false, lastSeenAt: null, view: null, device: null }])
  assert.equal((await fetch(`${base}/admin/presence`)).status, 401)
})

test('una señal de Ashley la pone en línea, con pantalla y dispositivo', async () => {
  assert.equal((await post('/presence', { view: 'exam' }, { 'User-Agent': IPHONE })).status, 200)
  const p = (await (await fetch(`${base}/admin/presence`, { headers: { cookie: admin } })).json()).people[0]
  assert.equal(p.online, true)
  assert.equal(p.view, 'exam')
  assert.equal(p.device, 'iPhone')
})

test('las señales del administrador no cuentan como Ashley', async () => {
  const before = (await getPresence()).lastSeenAt
  await new Promise((r) => setTimeout(r, 5))
  await post('/presence', { view: 'home' }, { cookie: admin })
  const p = await getPresence()
  assert.equal(p.lastSeenAt, before)
  assert.equal(p.view, 'exam')
})

test('pasada la ventana deja de estar en línea, y la última vez sobrevive a un reinicio', async () => {
  const later = new Date(Date.now() + ONLINE_WINDOW_MS + 1000)
  assert.equal((await getPresence(later)).online, false)
  const lastSeen = (await getPresence()).lastSeenAt
  resetPresence() // como si el servidor se reiniciara: se lee de la base
  const p = await getPresence(later)
  assert.equal(p.lastSeenAt, lastSeen)
  assert.equal(p.view, 'exam')
  assert.equal(p.device, 'iPhone')
})

test('vista desconocida cuenta como "other" y el dispositivo se reconoce', async () => {
  assert.equal((await post('/presence', { view: 'hackeo' })).status, 200)
  assert.equal((await getPresence()).view, 'other')
  assert.equal(deviceFrom('Mozilla/5.0 (Linux; Android 14; Pixel) Mobile Safari'), 'Android')
  assert.equal(deviceFrom(undefined), null)
})

test('mensajitos de Ian: le llegan con la señal de vida y quedan "vistos"', async () => {
  const cookie = admin
  const sent = await fetch(`${base}/admin/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ profile: 'ash', text: '¿Cómo vas, amor?', mood: 'happy' }),
  })
  assert.equal(sent.status, 201)
  // la app de Ash (sin cookie de admin en estas pruebas el acceso está abierto) recibe el mensaje
  const ping = await (await post('/presence', { view: 'home' })).json()
  assert.deepEqual(ping.messages.map((m: { text: string }) => m.text), ['¿Cómo vas, amor?'])
  await post(`/presence/messages/${ping.messages[0].id}/seen`, {})
  assert.deepEqual((await (await post('/presence', { view: 'home' })).json()).messages, [])
  const list = (await (await fetch(`${base}/admin/messages`, { headers: { cookie } })).json()).messages
  assert.ok(list[0].seenAt)
  // un admin abriendo la app no "se roba" los mensajes de Ash
  await fetch(`${base}/admin/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ profile: 'ash', text: 'otro' }) })
  assert.deepEqual((await (await post('/presence', { view: 'home' }, { cookie })).json()).messages, [])
})
