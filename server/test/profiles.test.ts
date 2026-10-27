// Perfiles: Ash es la dueña; Magola entra con su propio código, ve las fuentes de Ash
// y tiene su propio progreso, pero no huesitos ni premios, y no puede cambiar lo de Ash.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.ACCESS_CODE = 'codigo-viejo-123'
process.env.PROFILE_CODES = 'ash:codigo-ash-456,magola:codigo-magola-789'

const { createApp } = await import('../src/app.js')
const { db, closeDb } = await import('../src/db/client.js')
const { sources } = await import('../src/db/schema.js')

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

const enter = async (code: string, ip: string) => {
  const res = await fetch(`${base}/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ code }),
  })
  return { res, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' }
}
const get = (path: string, cookie: string) => fetch(`${base}${path}`, { headers: { cookie } })
// cookie de un dispositivo que entró antes de los perfiles (con ACCESS_CODE)
const legacy = `vq_access=${createHash('sha256').update('vetquiz-access:codigo-viejo-123').digest('hex')}`

test('el celular de Ash que ya había entrado sigue siendo Ash; el código viejo ya no abre dispositivos nuevos', async () => {
  const status = await (await get('/access', legacy)).json()
  assert.equal(status.profile, 'ash')
  assert.equal(status.owner, true)
  assert.equal((await enter('codigo-viejo-123', '10.0.0.1')).res.status, 401)
})

test('cada código entra a su perfil', async () => {
  const ash = await enter('codigo-ash-456', '10.0.0.2')
  assert.equal((await ash.res.json()).profile, 'ash')
  const magola = await enter('codigo-magola-789', '10.0.0.3')
  const body = await magola.res.json()
  assert.deepEqual([body.profile, body.owner, body.name], ['magola', false, 'Magola'])
  // una cookie de Magola con el nombre cambiado no sirve
  assert.equal((await get('/sources', magola.cookie.replace('magola.', 'ash.'))).status, 401)
})

test('Magola ve las fuentes de Ash pero no puede cambiarlas, y no tiene premios ni huesitos', async () => {
  const [src] = await db
    .insert(sources)
    .values({ title: 'Geopolítica', kind: 'text', color: 'lilac', contentHash: 'h1', status: 'ready', owner: 'ash' })
    .returning()
  const { cookie } = await enter('codigo-magola-789', '10.0.0.4')
  const list = (await (await get('/sources', cookie)).json()).sources
  assert.equal(list.length, 1)
  assert.equal(list[0].mine, false)
  assert.equal((await fetch(`${base}/sources/${src!.id}`, { method: 'DELETE', headers: { cookie } })).status, 403)
  assert.equal((await get('/rewards', cookie)).status, 403)
  const stats = (await (await get('/stats', cookie)).json()).stats
  assert.equal(stats.bones, 0)
  assert.equal(stats.displayName, 'Magola')
  // Ash sigue viendo la suya como propia y sus premios
  assert.equal((await (await get('/sources', legacy)).json()).sources[0].mine, true)
  assert.equal((await get('/rewards', legacy)).status, 200)
})

test('lo que sube Magola no le aparece a Ash', async () => {
  await db.insert(sources).values({ title: 'Apuntes de Magola', kind: 'text', color: 'mint', contentHash: 'h2', status: 'ready', owner: 'magola' })
  const { cookie } = await enter('codigo-magola-789', '10.0.0.5')
  assert.equal((await (await get('/sources', cookie)).json()).sources.length, 2)
  assert.equal((await (await get('/sources', legacy)).json()).sources.length, 1)
})

test('los mensajitos de Mocca son solo para Ash: a Magola no se pueden mandar', async () => {
  const send = (profile: string) =>
    fetch(`${base}/admin/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: legacy },
      body: JSON.stringify({ profile, text: 'hola' }),
    })
  assert.equal((await send('magola')).status, 403)
  assert.equal((await send('ash')).status, 201)
  // y la app de Magola nunca recibe mensajitos
  const { cookie } = await enter('codigo-magola-789', '10.0.0.9')
  const ping = await (await fetch(`${base}/presence`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: '{"view":"home"}' })).json()
  assert.deepEqual(ping.messages, [])
})
