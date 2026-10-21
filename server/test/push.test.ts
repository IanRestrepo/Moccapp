// Avisos push: suscribirse, a quién le llega cada aviso y el recordatorio diario (envío simulado).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.PROFILE_CODES = 'ash:codigo-ash-456,magola:codigo-magola-789'
process.env.ADMIN_CODE = 'admin-secreto-123'
process.env.VAPID_PUBLIC_KEY = 'BPk-fake-public-key-para-pruebas'
process.env.VAPID_PRIVATE_KEY = 'fake-private-key'
process.env.CRON_SECRET = 'cron-secreto'

const webpush = (await import('web-push')).default
const sent: { endpoint: string; payload: { title: string; body: string } }[] = []
webpush.setVapidDetails = () => {}
webpush.sendNotification = (async (sub: { endpoint: string }, payload: string) => {
  if (sub.endpoint.includes('vencido')) throw Object.assign(new Error('gone'), { statusCode: 410 })
  sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) })
  return { statusCode: 201, body: '', headers: {} }
}) as typeof webpush.sendNotification

const { createApp } = await import('../src/app.js')
const { db, closeDb } = await import('../src/db/client.js')
const { pushSubscriptions } = await import('../src/db/schema.js')
const { sendPush } = await import('../src/services/push.js')

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

const post = (path: string, body: unknown, cookie = '') =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) })
const enter = async (code: string) => (await post('/access', { code })).headers.get('set-cookie')!.split(';')[0]!
const sub = (endpoint: string) => ({ subscription: { endpoint, keys: { p256dh: 'p256dh-de-prueba', auth: 'auth-prueba' } } })

test('cada perfil registra su celular y recibe un aviso de bienvenida', async () => {
  const ash = await enter('codigo-ash-456')
  const magola = await enter('codigo-magola-789')
  assert.equal((await (await fetch(`${base}/push/key`, { headers: { cookie: ash } })).json()).enabled, true)
  assert.equal((await post('/push/subscribe', sub('https://push.example/ash-1'), ash)).status, 200)
  assert.equal((await post('/push/subscribe', sub('https://push.example/magola-1'), magola)).status, 200)
  assert.deepEqual(
    sent.map((s) => s.endpoint),
    ['https://push.example/ash-1', 'https://push.example/magola-1'],
  )
  assert.equal((await post('/push/subscribe', sub('https://push.example/x'))).status, 401)
})

test('pedir avisos de admin sin ser admin no da avisos de premios', async () => {
  const magola = await enter('codigo-magola-789')
  await post('/push/subscribe', { ...sub('https://push.example/magola-falsa-admin'), admin: true }, magola)
  sent.length = 0
  await sendPush({ admin: true }, { title: 'premio', body: 'x' })
  assert.equal(sent.length, 0)
})

test('los dispositivos vencidos (410) se borran solos', async () => {
  await db.insert(pushSubscriptions).values({ endpoint: 'https://push.example/vencido', profile: 'ash', p256dh: 'x'.repeat(12), auth: 'yyyy' })
  await sendPush({ profile: 'ash' }, { title: 'hola', body: 'x' })
  const left = await db.select().from(pushSubscriptions)
  assert.ok(!left.some((s) => s.endpoint.includes('vencido')))
})

test('recordatorio diario: solo con CRON_SECRET, y le llega a quien no ha estudiado hoy', async () => {
  assert.equal((await fetch(`${base}/cron/daily`)).status, 401)
  sent.length = 0
  const res = await fetch(`${base}/cron/daily`, { headers: { authorization: 'Bearer cron-secreto' } })
  assert.equal(res.status, 200)
  const { reminders } = await res.json()
  assert.deepEqual(
    reminders.map((r: { profile: string }) => r.profile),
    ['ash', 'magola'],
  )
  assert.ok(sent.some((s) => s.endpoint.includes('ash-1')))
  assert.ok(sent.some((s) => s.endpoint.includes('magola-1')))
})
