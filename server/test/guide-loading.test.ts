import assert from 'node:assert/strict'
import { after, test } from 'node:test'
process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.RETRY_BASE_MS = '1'
const { db, closeDb } = await import('../src/db/client.js')
const { sources, studyGuides } = await import('../src/db/schema.js')
const { setLlm } = await import('../src/ai/gemini.js')
const { GUIDE_SYSTEM_PROMPT } = await import('../src/ai/prompts.js')
const { ensureGuide, getGuide } = await import('../src/services/guide.js')
const { eq } = await import('drizzle-orm')
after(closeDb)

test('una generación vencida se muestra como error sin reiniciarse al consultar', async () => {
  const [s] = await db.insert(sources).values({ title: 'Vencida', kind: 'text', color: 'lilac', contentHash: 'stale-loading', status: 'ready' }).returning()
  const startedAt = new Date(Date.now() - 7 * 60_000)
  await db.insert(studyGuides).values({ sourceId: s!.id, status: 'generating', startedAt })
  let calls = 0
  setLlm({ async generateJson() { calls++; throw Error('no debe generar') }, async uploadFile() { throw Error('no usado') } })
  for (let i = 0; i < 3; i++) assert.equal((await getGuide(s!.id)).status, 'error')
  const [row] = await db.select().from(studyGuides).where(eq(studyGuides.sourceId, s!.id))
  assert.equal(row!.startedAt.getTime(), startedAt.getTime())
  assert.equal(calls, 0)
})

test('el contenido se puede leer aunque el mapa siga pendiente', async () => {
  const [s] = await db.insert(sources).values({ title: 'Ovario', kind: 'text', extractedText: 'El ovario produce ovocitos.', color: 'lilac', contentHash: 'ready-before-map', status: 'ready' }).returning()
  let release!: (value: unknown) => void
  const map = new Promise(resolve => { release = resolve })
  setLlm({
    async generateJson(p) {
      if (p.system !== GUIDE_SYSTEM_PROMPT) return map
      return { insufficientContent: false, overview: 'Reproducción', checklist: ['Función ovárica'], sections: [{
        title: 'Ovario', location: 'Página 1', summary: 'El ovario produce ovocitos.', keyPoints: ['Produce ovocitos'],
        terms: [{ term: 'Ovario', definition: 'Órgano que produce ovocitos.' }], tables: [], tip: '', bankTopics: ['Ovario'], images: [], courseLogistics: false,
      }] }
    }, async uploadFile() { throw Error('no usado') },
  })
  await ensureGuide(s!.id)
  try {
    let result = await getGuide(s!.id, false)
    for (let i = 0; i < 100 && result.status !== 'ready'; i++) {
      await new Promise(resolve => setTimeout(resolve, 10))
      result = await getGuide(s!.id, false)
    }
    assert.equal(result.status, 'ready')
    assert.equal(result.guide?.sections[0]?.title, 'Ovario')
    assert.ok(result.guide?.conceptMap.branches.length)
  } finally {
    release({ center: 'Ovario', centerFact: '', branches: [] })
    await new Promise(resolve => setTimeout(resolve, 100))
  }
})
