// Guía de estudio: se prepara una vez por fuente, se limpia, y el camino recorre sus secciones.
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { PathDTO, PathLessonDTO, SourceDTO, StudyGuideDTO } from '@vetquiz/shared'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), 'vetquiz-guide-'))
process.env.RETRY_BASE_MS = '2'

const { setLlm } = await import('../src/ai/gemini.js')
const { GUIDE_SYSTEM_PROMPT, MAP_SYSTEM_PROMPT } = await import('../src/ai/prompts.js')
const { createApp } = await import('../src/app.js')
const { closeDb } = await import('../src/db/client.js')
const { toGuide } = await import('../src/services/guide.js')
const { termCards } = await import('../src/services/path.js')
const { findImages } = await import('../src/services/images.js')

const TOPICS = ['Glándulas salivales', 'Estómago de rumiantes', 'Intestino delgado']
let guideCalls = 0
let guideMode: 'ok' | 'empty' = 'ok'

const section = (i: number) => ({
  title: `Sección ${i + 1}: ${TOPICS[i]}`,
  location: `Páginas ${i * 3 + 1}–${i * 3 + 3}`,
  summary: `Explicación de **${TOPICS[i]}**.\n\nSegundo párrafo con la relación entre estructura y función.`,
  keyPoints: ['Idea clave uno', 'Idea clave dos', ''],
  terms: [
    { term: `Término A${i}`, definition: `Definición del término A${i}.` },
    { term: `Término B${i}`, definition: `Definición del término B${i}.` },
  ],
  tables:
    i === 1
      ? [
          { title: 'Comparación', columns: ['Compartimento', 'Función'], rows: [['Rumen', 'Fermentación', 'celda de más'], ['Abomaso']] },
          { title: 'Rota', columns: ['Solo una'], rows: [['x']] },
        ]
      : [],
  tip: i === 0 ? 'Truco de prueba' : '',
  courseLogistics: false,
  bankTopics: [TOPICS[i]!],
  images: [] as { query: string; caption: string }[],
})
let mapCalls = 0
let mapMode: 'ok' | 'fail' = 'ok'
const leaf = (label: string, link = 'incluye', fact = `Dato de ${label}.`) => ({ label, link, fact })

setLlm({
  async generateJson(p) {
    if (p.system === GUIDE_SYSTEM_PROMPT) {
      guideCalls++
      if (guideMode === 'empty') return { insufficientContent: true, overview: '', sections: [], checklist: [] }
      return {
        insufficientContent: false,
        overview: 'De qué trata el tema y por qué importa.',
        sections: [0, 1, 2].map(section),
        checklist: ['Explicar la digestión en rumiantes'],
      }
    }
    if (p.system === MAP_SYSTEM_PROMPT) {
      mapCalls++
      if (mapMode === 'fail') throw new Error('mapa caído')
      return {
        center: 'Digestión',
        centerFact: 'Proceso que transforma el alimento en nutrientes.',
        branches: [
          { ...leaf('Boca', 'empieza en'), courseLogistics: false, children: [{ ...leaf('Saliva', 'Produce', 'Lubrica el bolo…'), children: [leaf('Amilasa', 'contiene…', '')] }] },
          { ...leaf('Calendario Académico', 'se estructura en'), courseLogistics: true, children: [{ ...leaf('Clases y Semanas'), children: [] }] },
          { ...leaf('Evaluación', 'se compone de'), courseLogistics: false, children: [] },
        ],
      }
    }
    // banco: 6 preguntas por tema, mitad fáciles, mitad difíciles
    const questions = TOPICS.flatMap((topic, t) =>
      Array.from({ length: 6 }, (_, k) => ({
        type: 'multiple_choice',
        difficulty: k < 3 ? 1 : 3,
        topic,
        prompt: `Pregunta ${t}-${k} sobre ${topic} con enunciado de prueba`,
        options: ['Correcta', 'Otra', 'Distinta', 'Ninguna'],
        correctIndex: 0,
        distractorRationales: [1, 2, 3].map((i) => ({ optionIndex: i, why: 'No es según la fuente.' })),
        matchingPairs: [],
        expectedAnswer: '',
        keyPoints: [],
        explanation: 'Explicación basada en la fuente para la prueba.',
        sourceQuote: `Cita literal ${t}-${k} de los apuntes.`,
        sourceLocation: 'Página 1',
      })),
    )
    return { title: 'Digestión comparada', topics: TOPICS, insufficientContent: false, questions }
  },
  async uploadFile() {
    throw new Error('no usado')
  },
})

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
const until = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean) => {
  for (let i = 0; i < 200; i++) {
    const v = await fn()
    if (ok(v)) return v
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('se demoró demasiado')
}
async function newSource(text: string) {
  const { body } = await api<{ source: SourceDTO }>('POST', '/sources', { kind: 'text', text })
  await until(
    () => api<{ source: SourceDTO }>('GET', `/sources/${body.source.id}`),
    (r) => r.body.source.status === 'ready',
  )
  return body.source.id
}

test('la guía se limpia: sin viñetas vacías, tablas con celdas parejas y sin tablas de una columna', () => {
  const g = toGuide({
    insufficientContent: false,
    overview: ' Tema ',
    sections: [section(1), { ...section(0), title: ' ', summary: '' }],
    checklist: [' ', 'Saber algo'],
  })
  assert.equal(g.sections.length, 1)
  assert.deepEqual(g.sections[0]!.keyPoints, ['Idea clave uno', 'Idea clave dos'])
  assert.equal(g.sections[0]!.tables.length, 1)
  assert.deepEqual(g.sections[0]!.tables[0]!.rows, [['Rumen', 'Fermentación'], ['Abomaso', '']])
  assert.deepEqual(g.checklist, ['Saber algo'])
  // sin mapa de la IA, se arma uno con los temas y sus términos
  assert.deepEqual(g.conceptMap.branches.map((b) => b.label), [g.sections[0]!.title])
  assert.equal(g.conceptMap.branches[0]!.children![0]!.label, 'Término A1')
})

test('preguntas de términos: la correcta primero y 3 distractores distintos, cada uno con su definición', () => {
  const g = toGuide({ insufficientContent: false, overview: '', sections: [0, 1].map(section), checklist: [] })
  const cards = termCards('src', 0, g)
  assert.equal(cards.length, 2)
  const d = cards[0]!.data
  assert.ok(d.type === 'multiple_choice')
  assert.equal(d.options[d.correctIndex], 'Término A0')
  assert.equal(new Set(d.options).size, 4)
  assert.match(d.distractorRationales[0]!.why, /Definición/)
  // con menos de 4 términos en toda la guía no hay con qué armar opciones
  assert.deepEqual(termCards('src', 0, { ...g, sections: [g.sections[0]!] }), [])
})

test('abrir la guía la prepara una sola vez y el camino pasa a recorrer sus secciones', async () => {
  const id = await newSource('La digestión en los rumiantes es un proceso complejo. '.repeat(10))
  // antes de la guía: lecciones por dificultad
  const before = await api<PathDTO>('GET', '/path')
  assert.ok(['none', 'generating', 'ready'].includes(before.body.units[0]!.guide))

  const first = await api<StudyGuideDTO>('GET', `/guide/${id}`)
  assert.equal(first.status, 200)
  const ready = await until(
    () => api<StudyGuideDTO>('GET', `/guide/${id}`),
    (r) => r.body.status === 'ready',
  )
  assert.equal(guideCalls, 1)
  assert.equal(ready.body.guide!.sections.length, 3)
  assert.equal(ready.body.title, 'Digestión comparada')
  assert.ok(ready.body.questions > 0)

  const p = (await api<PathDTO>('GET', '/path')).body
  const unit = p.units.find((u) => u.sourceId === id)!
  assert.equal(unit.guide, 'ready')
  assert.deepEqual(
    unit.nodes.map((n) => n.kind),
    ['lesson', 'lesson', 'lesson', 'boss', 'chest'],
  )
  assert.equal(unit.nodes[0]!.label, 'Sección 1: Glándulas salivales')

  // la lección trae la sección para leer y preguntas de ESA sección (términos + banco)
  const lesson = (await api<PathLessonDTO>('GET', `/path/${unit.nodes[0]!.key}`)).body
  assert.equal(lesson.section!.title, 'Sección 1: Glándulas salivales')
  assert.ok(lesson.cards.some((c) => c.id.includes(':t')))
  assert.ok(lesson.cards.filter((c) => !c.id.includes(':t')).every((c) => c.topic === 'Glándulas salivales'))

  const done = await api<{ stars: number; nextKey: string | null }>('POST', `/path/${unit.nodes[0]!.key}/complete`, {
    firstTry: lesson.cards.length,
    total: lesson.cards.length,
  })
  assert.equal(done.body.stars, 3)
  assert.equal(done.body.nextKey, unit.nodes[1]!.key)
})

test('si la fuente no da para guía queda en error, y se puede reintentar', async () => {
  guideMode = 'empty'
  const id = await newSource('Otro tema distinto con su propio texto de estudio largo. '.repeat(10))
  const r = await until(
    () => api<StudyGuideDTO>('GET', `/guide/${id}`),
    (x) => x.body.status === 'error',
  )
  assert.ok(r.body.error)
  // abrirla otra vez no gasta otra llamada; reintentar sí
  const calls = guideCalls
  await api('GET', `/guide/${id}`)
  assert.equal(guideCalls, calls)
  guideMode = 'ok'
  const retried = await api<StudyGuideDTO>('POST', `/guide/${id}/retry`)
  assert.equal(retried.body.status, 'generating')
  await until(
    () => api<StudyGuideDTO>('GET', `/guide/${id}`),
    (x) => x.body.status === 'ready',
  )
})

test('imágenes: toma la primera útil de Commons, salta las raras y no repite la misma en dos secciones', async () => {
  const page = (title: string, w: number, h: number, mime = 'image/jpeg', index = 1) => ({
    title,
    index,
    imageinfo: [{ thumburl: `https://img/${title}`, thumbwidth: w, thumbheight: h, mime, descriptionurl: `https://c/${title}`, extmetadata: { Artist: { value: '<a href="x">Ana</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }],
  })
  const calls: string[] = []
  const fakeFetch = (async (url: URL) => {
    const q = url.searchParams.get('gsrsearch')!.replace(' filetype:bitmap|drawing', '')
    calls.push(q)
    if (q === 'falla') throw new Error('sin red')
    const pages = q === 'rumen'
      ? { a: page('tira', 2000, 100, 'image/jpeg', 1), b: page('pdf', 800, 600, 'application/pdf', 2), c: page('rumen.jpg', 800, 600, 'image/jpeg', 3) }
      : { c: page('rumen.jpg', 800, 600) }
    return new Response(JSON.stringify({ query: { pages } }))
  }) as unknown as typeof fetch
  const out = await findImages(
    [
      { images: [{ query: 'rumen', caption: 'El rumen' }, { query: 'falla', caption: 'x' }] },
      { images: [{ query: 'otra', caption: 'La misma imagen' }] },
    ],
    fakeFetch,
  )
  assert.equal(out[0]!.length, 1)
  assert.deepEqual([out[0]![0]!.url, out[0]![0]!.caption, out[0]![0]!.credit, out[0]![0]!.license], ['https://img/rumen.jpg', 'El rumen', 'Ana', 'CC BY-SA 4.0'])
  assert.deepEqual(out[1], [])
  assert.deepEqual(calls.sort(), ['falla', 'otra', 'rumen'])
})

test('búsqueda de imágenes cada vez más general', async () => {
  const { broader } = await import('../src/services/images.js')
  assert.deepEqual(broader('dog extrinsic shoulder muscles anatomy'), [
    'dog extrinsic shoulder muscles anatomy',
    'dog extrinsic shoulder muscles',
    'dog extrinsic shoulder',
    'dog extrinsic',
  ])
  assert.deepEqual(broader('rumen'), ['rumen'])
})

test('mini examen de un tema: trae las preguntas de ese tema y, desde la guía, se puede hacer en cualquier orden', async () => {
  guideMode = 'ok'
  const id = await newSource('Tercer tema de prueba con suficiente texto para estudiar. '.repeat(10))
  await api('GET', `/guide/${id}`)
  await until(
    () => api<StudyGuideDTO>('GET', `/guide/${id}`),
    (r) => r.body.status === 'ready',
  )
  const quiz = await api<{ title: string; topicCount: number; pathKey: string; cards: { topic: string; id: string }[] }>('GET', `/guide/${id}/topic/2`)
  assert.equal(quiz.status, 200)
  assert.equal(quiz.body.title, 'Sección 3: Intestino delgado')
  assert.equal(quiz.body.topicCount, 3)
  assert.equal(quiz.body.pathKey, `${id}:s2`)
  assert.ok(quiz.body.cards.length > 0)
  assert.ok(quiz.body.cards.filter((c) => !c.id.includes(':t')).every((c) => c.topic === 'Intestino delgado'))
  assert.equal((await api('GET', `/guide/${id}/topic/9`)).status, 404)

  // en el camino el tema 3 sigue bloqueado; desde la guía sí cuenta
  const body = { firstTry: 3, total: 3 }
  assert.equal((await api('POST', `/path/${id}:s2/complete`, body)).status, 403)
  const ok = await api<{ stars: number }>('POST', `/path/${id}:s2/complete`, { ...body, fromGuide: true })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.stars, 3)
  const unit = (await api<PathDTO>('GET', '/path')).body.units.find((u) => u.sourceId === id)!
  assert.equal(unit.nodes[2]!.status, 'done')
})

test('la logística del curso (metodología, evaluación, talleres) no sale en la guía ni en el mapa', async () => {
  const { withoutLogistics } = await import('../src/services/guide.js')
  const base = toGuide({ insufficientContent: false, overview: '', sections: [0, 1].map(section), checklist: [] })
  const g = withoutLogistics({
    ...base,
    sections: [...base.sections, { ...base.sections[0]!, title: 'Metodología y Clases' }, { ...base.sections[0]!, title: 'Evaluación clínica del paciente' }],
    conceptMap: {
      center: 'Geopolítica',
      branches: [
        { label: 'Metodología y Clases', children: [{ label: 'Talleres' }] },
        { label: 'Evaluación', children: [{ label: 'Exámenes' }] },
        { label: 'Teorías geopolíticas', children: [{ label: 'Heartland', detail: 'Mackinder' }, { label: 'Examen escrito 1', detail: 'vale el 30% en semana 7' }] },
      ],
    },
    checklist: ['Explicar la teoría del Heartland', 'Examen escrito 2: vale el 10% en semana 16'],
  })
  assert.deepEqual(g.sections.map((s) => s.title), [base.sections[0]!.title, base.sections[1]!.title, 'Evaluación clínica del paciente'])
  assert.deepEqual(g.conceptMap.branches.map((b) => b.label), ['Teorías geopolíticas'])
  assert.deepEqual(g.conceptMap.branches[0]!.children!.map((c) => c.label), ['Heartland'])
  assert.deepEqual(g.checklist, ['Explicar la teoría del Heartland'])
  // si TODO es logística (la fuente es el programa del curso) no se deja vacía
  const only = withoutLogistics({ ...base, sections: [{ ...base.sections[0]!, title: 'Evaluación' }] })
  assert.equal(only.sections.length, 1)
})

test('mapa conceptual: llamada aparte, con enlaces y datos, sin logística del curso; si falla, la guía sale igual', async () => {
  guideMode = 'ok'
  mapMode = 'ok'
  const before = mapCalls
  const id = await newSource('Cuarto tema de prueba con suficiente texto para estudiar el mapa. '.repeat(10))
  await api('GET', `/guide/${id}`)
  const ready = await until(
    () => api<StudyGuideDTO>('GET', `/guide/${id}`),
    (r) => r.body.status === 'ready',
  )
  assert.equal(mapCalls, before + 1)
  const map = ready.body.guide!.conceptMap
  assert.equal(map.centerFact, 'Proceso que transforma el alimento en nutrientes.')
  // la rama marcada como logística y la que solo dice "Evaluación" no salen
  assert.deepEqual(map.branches.map((b) => b.label), ['Boca'])
  const saliva = map.branches[0]!.children![0]!
  // enlace en minúscula y sin puntos suspensivos; dato sin "…"
  assert.deepEqual([map.branches[0]!.link, saliva.link, saliva.detail], ['empieza en', 'produce', 'Lubrica el bolo'])
  assert.deepEqual(saliva.children, [{ label: 'Amilasa', link: 'contiene' }])
  assert.equal(ready.body.guide!.version, 2)

  mapMode = 'fail'
  const id2 = await newSource('Quinto tema de prueba, cuando el mapa de la IA no llega. '.repeat(10))
  await api('GET', `/guide/${id2}`)
  const r2 = await until(
    () => api<StudyGuideDTO>('GET', `/guide/${id2}`),
    (r) => r.body.status !== 'generating',
  )
  assert.equal(r2.body.status, 'ready')
  assert.equal(r2.body.guide!.conceptMap.branches.length, 3)
  mapMode = 'ok'
})

test('una guía hecha con reglas viejas se rehace sola al abrirla', async () => {
  const { db } = await import('../src/db/client.js')
  const { studyGuides } = await import('../src/db/schema.js')
  const { eq } = await import('drizzle-orm')
  const id = await newSource('Sexto tema de prueba para la guía vieja que se rehace. '.repeat(10))
  await api('GET', `/guide/${id}`)
  const first = await until(
    () => api<StudyGuideDTO>('GET', `/guide/${id}`),
    (r) => r.body.status === 'ready',
  )
  // se guarda como si fuera de la versión 1
  await db.update(studyGuides).set({ data: { ...first.body.guide!, version: 1 } }).where(eq(studyGuides.sourceId, id))
  const calls = guideCalls
  const again = await api<StudyGuideDTO>('GET', `/guide/${id}`)
  assert.equal(again.body.status, 'generating')
  await until(
    () => api<StudyGuideDTO>('GET', `/guide/${id}`),
    (r) => r.body.status === 'ready',
  )
  assert.equal(guideCalls, calls + 1)
})
