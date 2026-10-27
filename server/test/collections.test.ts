// Carpetas: cada persona agrupa sus fuentes; una fuente vive en una sola carpeta por persona.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.PROFILE_CODES = 'ash:codigo-ash-456,magola:codigo-magola-789'

const { createApp } = await import('../src/app.js')
const { db, closeDb } = await import('../src/db/client.js')
const { sources } = await import('../src/db/schema.js')

let base = ''
let server: import('node:http').Server
let ash = ''
let magola = ''
let s1 = ''
let s2 = ''
let sMagola = ''
const req = (method: string, path: string, cookie: string, body?: unknown) =>
  fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined })
const enter = async (code: string) =>
  (await fetch(`${base}/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })).headers
    .get('set-cookie')!
    .split(';')[0]!

before(async () => {
  server = createApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  ash = await enter('codigo-ash-456')
  magola = await enter('codigo-magola-789')
  const rows = await db
    .insert(sources)
    .values([
      { title: 'Metabolismo', kind: 'text', color: 'lilac', contentHash: 'c1', status: 'ready', owner: 'ash' },
      { title: 'Enzimas', kind: 'text', color: 'mint', contentHash: 'c2', status: 'ready', owner: 'ash' },
      { title: 'Apuntes de Magola', kind: 'text', color: 'sky', contentHash: 'c3', status: 'ready', owner: 'magola' },
    ])
    .returning()
  ;[s1, s2, sMagola] = rows.map((r) => r.id) as [string, string, string]
})
after(async () => {
  server.close()
  await closeDb()
})

test('crear una carpeta con fuentes adentro', async () => {
  const res = await req('POST', '/collections', ash, { name: 'BIOQUÍMICA SEMESTRE 2', sourceIds: [s1, s2] })
  assert.equal(res.status, 201)
  const { collection } = await res.json()
  assert.equal(collection.name, 'BIOQUÍMICA SEMESTRE 2')
  assert.deepEqual([...collection.sourceIds].sort(), [s1, s2].sort())
})

test('mover una fuente a otra carpeta la saca de la primera', async () => {
  const { collection: otra } = await (await req('POST', '/collections', ash, { name: 'Parcial 1' })).json()
  await req('POST', `/collections/${otra.id}/sources`, ash, { sourceIds: [s1] })
  const list = (await (await req('GET', '/collections', ash)).json()).collections
  const bio = list.find((c: { name: string }) => c.name === 'BIOQUÍMICA SEMESTRE 2')
  const p1 = list.find((c: { name: string }) => c.name === 'Parcial 1')
  assert.deepEqual(bio.sourceIds, [s2])
  assert.deepEqual(p1.sourceIds, [s1])
})

test('las carpetas son de cada persona y no se pueden tocar las ajenas', async () => {
  const ashList = (await (await req('GET', '/collections', ash)).json()).collections
  assert.equal((await (await req('GET', '/collections', magola)).json()).collections.length, 0)
  assert.equal((await req('DELETE', `/collections/${ashList[0].id}`, magola)).status, 404)
  // Magola puede meter fuentes de Ash en SU carpeta; Ash no puede meter las de Magola
  const { collection } = await (await req('POST', '/collections', magola, { name: 'Bioquímica', sourceIds: [s1, sMagola] })).json()
  assert.equal(collection.sourceIds.length, 2)
  const { collection: c2 } = await (await req('POST', '/collections', ash, { name: 'Intento', sourceIds: [sMagola] })).json()
  assert.deepEqual(c2.sourceIds, [])
})

test('borrar la carpeta no borra las fuentes', async () => {
  const list = (await (await req('GET', '/collections', ash)).json()).collections
  for (const c of list) assert.equal((await req('DELETE', `/collections/${c.id}`, ash)).status, 204)
  assert.equal((await (await req('GET', '/sources', ash)).json()).sources.length, 2)
})
