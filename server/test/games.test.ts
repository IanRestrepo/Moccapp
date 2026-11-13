// Jueguitos: sopa de letras desde la guía, sobres con tope diario y Moccas de colección con rarezas.
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { GameCompleteResponse, GamesDTO, MoccaAlbumDTO, OpenPackResponse, StudyGuide, WordSearchDTO } from '@vetquiz/shared'
import { MOCCA_INFO } from '@vetquiz/shared'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), 'vetquiz-games-'))

const games = await import('../src/services/games.js')
const { createApp } = await import('../src/app.js')
const { db, closeDb } = await import('../src/db/client.js')
const schema = await import('../src/db/schema.js')

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
const api = async <T>(method: string, url: string, body?: unknown) => {
  const res = await fetch(`${base}${url}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, body: (await res.json()) as T }
}
// azar con semilla: las pruebas salen igual siempre
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

const term = (t: string, d: string) => ({ term: t, definition: d })
const guide: StudyGuide = {
  version: 2,
  overview: '',
  checklist: [],
  conceptMap: { center: 'Músculos', branches: [] },
  sections: [
    {
      title: 'Extrínsecos', location: '', summary: 'x', keyPoints: [], tables: [], tip: '', bankTopics: [], images: [],
      terms: [term('Trapecio', 'Músculo que eleva la escápula y une el cuello con el miembro.'), term('Serrato ventral', 'Sostiene el tronco entre los miembros torácicos.'), term('Romboides', 'Fija la escápula contra el tórax.')],
    },
    {
      title: 'Brazo', location: '', summary: 'x', keyPoints: [], tables: [], tip: '', bankTopics: [], images: [],
      terms: [term('Bíceps', 'Flexiona el codo; el bíceps se origina en el tubérculo supraglenoideo.'), term('Tríceps', 'Principal extensor del codo, se inserta en el olécranon.'), term('Ancóneo', 'Ayuda a extender el codo.')],
    },
    {
      title: 'Nervios', location: '', summary: 'x', keyPoints: [], tables: [], tip: '', bankTopics: [], images: [],
      terms: [term('Nervio radial', 'Inerva los extensores del codo, carpo y dedos.'), term('Músculo esternocleidomastoideo del cuello', 'Demasiado largo para la sopa de letras.')],
    },
  ],
}

test('palabras de la sopa: sin tildes ni espacios, pista sin la respuesta, las larguísimas fuera', () => {
  assert.equal(games.gridWord('Médula ósea'), 'MEDULAOSEA')
  assert.equal(games.gridWord('Ñandú'), 'ÑANDU')
  const c = games.candidates(guide)
  // "Nervio radial" (12 letras) cabe; "Serrato ventral" (14) no cabe en la cuadrícula
  assert.ok(c.some((x) => x.word === 'NERVIORADIAL'))
  assert.ok(!c.some((x) => x.word === 'SERRATOVENTRAL'))
  assert.ok(!c.some((x) => x.word.length > 12))
  const biceps = c.find((x) => x.word === 'BICEPS')!
  assert.ok(!/bíceps/i.test(biceps.clue))
  assert.match(biceps.clue, /_____/)
})

test('la sopa: cada palabra está donde dice, sin ir al revés, y mezcla temas', () => {
  for (let seed = 1; seed < 40; seed++) {
    const p = games.buildWordSearch(games.candidates(guide), seeded(seed))!
    assert.ok(p, `semilla ${seed}`)
    assert.equal(p.rows.length, p.size)
    assert.ok(p.rows.every((r) => [...r].length === p.size))
    assert.ok(p.words.length >= 4 && p.words.length <= 7)
    for (const w of p.words) {
      // nunca hacia la izquierda ni hacia arriba en vertical
      assert.ok(w.dc === 1 || (w.dc === 0 && w.dr === 1))
      const letters = [...w.word].map((_, i) => [...p.rows[w.row + w.dr * i]!][w.col + w.dc * i]).join('')
      assert.equal(letters, w.word)
    }
    assert.ok(new Set(p.words.map((w) => w.topic)).size >= 2)
  }
  // con muy pocas palabras no hay sopa
  assert.equal(games.buildWordSearch(games.candidates(guide).slice(0, 3), seeded(3)), null)
})

test('sobres: la primera carta del primer sobre es especial o mejor, y no se repiten dentro del sobre', () => {
  const pool = games.availableMoods(true)
  for (let seed = 1; seed < 200; seed++) {
    const m = games.drawCard(pool, seeded(seed), 'special')
    assert.notEqual(MOCCA_INFO[m].rarity, 'normal')
  }
  // en muchas tiradas salen las tres rarezas, y las normales son las más
  const rng = seeded(7)
  const counts = { normal: 0, special: 0, legendary: 0 }
  for (let i = 0; i < 3000; i++) counts[MOCCA_INFO[games.drawCard(pool, rng)].rarity]++
  assert.ok(counts.legendary > 60 && counts.legendary < 400, JSON.stringify(counts))
  assert.ok(counts.normal > counts.special && counts.special > counts.legendary)
  // la enamorada es solo de Ash
  assert.ok(pool.includes('inlove'))
  assert.ok(!games.availableMoods(false).includes('inlove'))
})

test('jugar: sopa nueva, terminarla da un sobre (hasta el tope del día) y abrirlo llena el álbum', async () => {
  const [src] = await db.insert(schema.sources).values({ title: 'Músculos del miembro torácico', kind: 'text', color: 'sky', contentHash: 'm1', status: 'ready', owner: 'ash' }).returning()
  // sin guía todavía: avisa que la está preparando
  const early = await api<{ error: { code: string } }>('POST', '/games/wordsearch', { sourceId: src!.id })
  assert.equal(early.status, 409)
  assert.equal(early.body.error.code, 'GUIDE_NOT_READY')
  await db
    .insert(schema.studyGuides)
    .values({ sourceId: src!.id, status: 'ready', data: guide })
    .onConflictDoUpdate({ target: schema.studyGuides.sourceId, set: { status: 'ready', data: guide } })

  const list = (await api<GamesDTO>('GET', '/games')).body
  assert.equal(list.sources[0]!.words, 6)
  assert.equal(list.packs, 0)

  const ws = (await api<WordSearchDTO>('POST', '/games/wordsearch', { sourceId: src!.id })).body
  assert.equal(ws.title, 'Músculos del miembro torácico')
  assert.ok(ws.words.length >= 4)
  const done = (await api<GameCompleteResponse>('POST', `/games/${ws.id}/complete`)).body
  assert.equal(done.pack, true)
  assert.equal(done.packs, 1)
  assert.ok(done.xp >= 25)
  // terminar la misma dos veces no da otro sobre
  assert.equal((await api<GameCompleteResponse>('POST', `/games/${ws.id}/complete`)).body.packs, 1)

  const opened = (await api<OpenPackResponse>('POST', '/mocca-cards/open')).body
  assert.equal(opened.cards.length, games.CARDS_PER_PACK)
  assert.equal(new Set(opened.cards.map((c) => c.mood)).size, games.CARDS_PER_PACK)
  assert.ok(opened.cards.every((c) => c.isNew))
  assert.notEqual(opened.cards[0]!.rarity, 'normal')
  assert.equal(opened.packs, 0)
  // sin sobres no se abre nada
  assert.equal((await api('POST', '/mocca-cards/open')).status, 409)

  const album = (await api<MoccaAlbumDTO>('GET', '/mocca-cards')).body
  assert.equal(album.cards.length, games.CARDS_PER_PACK)
  assert.equal(album.available.length, 25)

  // tope diario de sobres
  for (let i = 1; i < games.DAILY_PACKS; i++) {
    const g = (await api<WordSearchDTO>('POST', '/games/wordsearch', { sourceId: src!.id })).body
    assert.equal((await api<GameCompleteResponse>('POST', `/games/${g.id}/complete`)).body.pack, true)
  }
  const extra = (await api<WordSearchDTO>('POST', '/games/wordsearch', { sourceId: src!.id })).body
  const capped = (await api<GameCompleteResponse>('POST', `/games/${extra.id}/complete`)).body
  assert.equal(capped.pack, false)
  assert.equal(capped.packsToday, games.DAILY_PACKS)
})
