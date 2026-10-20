// Pruebas de punta a punta de la ingesta: HTTP real → Express → Postgres embebido (PGlite en memoria),
// con Gemini reemplazado por un doble para no gastar cuota ni depender de la red.
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import JSZip from 'jszip'
import { ApiError } from '@google/genai'
import type { SourceDTO } from '@vetquiz/shared'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), 'vetquiz-'))
process.env.RETRY_BASE_MS = '5'
process.env.GEMINI_INLINE_MAX_MB = '0.01' // ~10 KB: los archivos más grandes van por la File API
process.env.GEMINI_PDF_CHUNK_MAX_MB = '0.03' // ~31 KB: los PDF más grandes se dividen

const { setLlm, classifyGeminiError } = await import('../src/ai/gemini.js')
type Llm = import('../src/ai/gemini.js').Llm
type GenerateJsonParams = import('../src/ai/gemini.js').GenerateJsonParams
const { Errors } = await import('../src/lib/errors.js')
const { createApp } = await import('../src/app.js')
const { closeDb } = await import('../src/db/client.js')
const { parseYoutubeId } = await import('../src/services/ingest/youtube.js')
const { extractPptx } = await import('../src/services/ingest/office.js')
const { splitPdf } = await import('../src/services/ingest/pdf-split.js')
const { cleanLocation, mergeTopics } = await import('../src/services/bank.js')
const { PDFDocument } = await import('pdf-lib')

// ── Doble de Gemini ──────────────────────────────────────────

let callCounter = 0
const calls: GenerateJsonParams[] = []
const uploads: string[] = []

function fakeQuestion(i: number, difficulty: number) {
  const base = {
    difficulty,
    topic: 'Farmacología',
    prompt: `Pregunta ${i}: ¿qué hace el fármaco número ${i} según la fuente?`,
    explanation: 'Según la fuente, el fármaco actúa de esa manera.',
    sourceQuote: `Cita literal número ${i} de la fuente de estudio.`,
    sourceLocation: 'Página 1',
    options: [] as string[],
    correctIndex: -1,
    distractorRationales: [] as { optionIndex: number; why: string }[],
    matchingPairs: [] as { left: string; right: string }[],
    expectedAnswer: '',
    keyPoints: [] as string[],
  }
  switch (i % 4) {
    case 0:
      return { ...base, type: 'multiple_choice', options: ['COX', 'LOX', 'PLA2', 'MAO'], correctIndex: 0, distractorRationales: [{ optionIndex: 1, why: 'La LOX no es el blanco' }] }
    case 1:
      return { ...base, type: 'true_false', options: ['Verdadero', 'Falso'], correctIndex: 1, distractorRationales: [{ optionIndex: 0, why: 'La fuente dice otra cosa' }] }
    case 2:
      return { ...base, type: 'matching', matchingPairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }, { left: 'c', right: '3' }] }
    default:
      return { ...base, type: 'short_answer', expectedAnswer: 'Inhibe la COX', keyPoints: ['COX'] }
  }
}

/** 24 preguntas válidas + 1 dañada (que Zod debe descartar). */
function goodBatch() {
  const questions = Array.from({ length: 24 }, (_, k) => fakeQuestion(++callCounter * 100 + k, (k % 4) + 1))
  questions.push({ ...fakeQuestion(999_000 + callCounter, 1), type: 'multiple_choice', options: ['solo una'] } as never)
  return { title: 'AINEs en caninos', topics: ['Farmacología', 'AINEs'], insufficientContent: false, questions }
}

let behavior: (p: GenerateJsonParams) => Promise<unknown> = async () => goodBatch()

const fakeLlm: Llm = {
  async generateJson(p) {
    calls.push(p)
    return behavior(p)
  },
  async uploadFile(localPath, mimeType) {
    uploads.push(localPath)
    return { uri: `https://generativelanguage.googleapis.com/v1beta/files/fake-${uploads.length}`, mimeType, expiresAt: new Date(Date.now() + 48 * 3600_000) }
  },
}
setLlm(fakeLlm)

// oEmbed de YouTube simulado (el resto de fetch, real)
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.startsWith('https://www.youtube.com/oembed')) {
    if (url.includes('PRIVADO1234')) return new Response('Unauthorized', { status: 401 })
    return Response.json({ title: 'Fisiología renal — clase 3' })
  }
  return realFetch(input, init)
}) as typeof fetch

// ── Servidor ─────────────────────────────────────────────────

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
beforeEach(() => {
  behavior = async () => goodBatch()
})

const LONG_TEXT =
  'Los antiinflamatorios no esteroideos (AINEs) inhiben la ciclooxigenasa (COX-1 y COX-2), reduciendo la síntesis de prostaglandinas. ' +
  'El meloxicam en caninos se administra a 0,2 mg/kg el primer día y luego 0,1 mg/kg cada 24 horas. ' +
  'En felinos con enfermedad renal se debe tener precaución porque la perfusión renal depende de prostaglandinas.'

const postJson = (body: unknown) =>
  fetch(`${base}/sources`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

async function postFile(name: string, type: string, data: Buffer | Uint8Array, title?: string) {
  const form = new FormData()
  form.append('file', new Blob([data], { type }), name)
  if (title) form.append('title', title)
  return fetch(`${base}/sources`, { method: 'POST', body: form })
}

async function waitDone(id: string): Promise<SourceDTO> {
  for (let i = 0; i < 200; i++) {
    const { source } = (await (await fetch(`${base}/sources/${id}`)).json()) as { source: SourceDTO }
    if (source.status !== 'processing') return source
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('timeout esperando la generación')
}

async function makeDocx(text: string): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}

/** PDF real de `pages` páginas con ~4 KB de texto cada una */
async function makePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([600, 800])
    for (let l = 0; l < 60; l++) page.drawText(`Página ${i} línea ${l}: músculo bíceps braquial, inserción en la tuberosidad del radio.`.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), { x: 10, y: 780 - l * 12, size: 8 })
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }))
}

async function makePptx(): Promise<Buffer> {
  const zip = new JSZip()
  const slide = (lines: string[]) =>
    `<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${lines.map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join('')}</p:spTree></p:cSld></p:sld>`
  zip.file('ppt/slides/slide2.xml', slide(['Ciclo de Fasciola hepatica', 'Huésped intermediario: caracol Lymnaea']))
  zip.file('ppt/slides/slide10.xml', slide(['Tratamiento: triclabendazol 12 mg/kg VO']))
  zip.file('ppt/slides/slide1.xml', slide(['Parasitología bovina &amp; ovina']))
  zip.file('ppt/notesSlides/notesSlide2.xml', slide(['El profe dijo que esto entra en el parcial', '2']))
  return zip.generateAsync({ type: 'nodebuffer' })
}

// ── Tests ────────────────────────────────────────────────────

describe('texto pegado', () => {
  let id = ''

  test('crea la fuente (202), genera el banco y reemplaza el título con el de la IA', async () => {
    const before = calls.length
    const res = await postJson({ kind: 'text', text: LONG_TEXT })
    assert.equal(res.status, 202)
    const body = (await res.json()) as { source: SourceDTO; deduplicated: boolean }
    assert.equal(body.deduplicated, false)
    assert.equal(body.source.status, 'processing')
    id = body.source.id

    const done = await waitDone(id)
    assert.equal(done.status, 'ready')
    assert.equal(done.title, 'AINEs en caninos')
    assert.equal(calls.length - before, 2, 'dos llamadas en paralelo (niveles 1–2 y 3–4)')
    assert.equal(done.bank.total, 48, '24 + 24 válidas; las dañadas se descartan')
    assert.deepEqual(done.bank.byDifficulty, { 1: 12, 2: 12, 3: 12, 4: 12 })
    assert.equal(done.bank.byType.matching, 12)
    assert.deepEqual(done.topics, ['Farmacología', 'AINEs'])
    assert.equal(done.format, 'text')
    assert.match(done.excerpt!, /^Los antiinflamatorios/)

    const part = calls.at(-1)!.source[0]!
    assert.match(part.text!, /meloxicam en caninos se administra a 0,2 mg\/kg/)
    assert.match(calls.at(-1)!.system, /ÚNICAMENTE/)
  })

  test('el mismo texto con otros espacios no vuelve a llamar a la IA (200, deduplicated)', async () => {
    const before = calls.length
    const res = await postJson({ kind: 'text', text: `  ${LONG_TEXT.replace(/ /g, '   ')}\n\n\n` })
    assert.equal(res.status, 200)
    const body = (await res.json()) as { source: SourceDTO; deduplicated: boolean }
    assert.equal(body.deduplicated, true)
    assert.equal(body.source.id, id)
    assert.equal(calls.length, before)
  })

  test('un título escrito por ella no se reemplaza', async () => {
    const res = await postJson({ kind: 'text', title: 'Mi resumen', text: `${LONG_TEXT} Otro párrafo distinto.` })
    const done = await waitDone(((await res.json()) as { source: SourceDTO }).source.id)
    assert.equal(done.title, 'Mi resumen')
  })

  test('texto muy corto → 400 con mensaje amigable', async () => {
    const res = await postJson({ kind: 'text', text: 'muy corto' })
    assert.equal(res.status, 400)
    const body = (await res.json()) as { error: { message: string } }
    assert.match(body.error.message, /al menos un párrafo/)
  })

  test('lista y borra', async () => {
    const list = (await (await fetch(`${base}/sources`)).json()) as { sources: SourceDTO[] }
    assert.ok(list.sources.some((s) => s.id === id))
    assert.equal((await fetch(`${base}/sources/${id}`, { method: 'DELETE' })).status, 204)
    assert.equal((await fetch(`${base}/sources/${id}`)).status, 404)
  })
})

describe('archivos', () => {
  test('DOCX: extrae el texto, arregla el nombre con tildes y se lo manda a Gemini como texto', async () => {
    const docx = await makeDocx(`Fisiología renal. ${LONG_TEXT}`)
    const res = await postFile('Fisiología_renal-parcial.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docx, 'Fisio renal')
    assert.equal(res.status, 202)
    const done = await waitDone(((await res.json()) as { source: SourceDTO }).source.id)
    assert.equal(done.status, 'ready')
    assert.equal(done.format, 'docx')
    assert.equal(done.title, 'Fisio renal')
    assert.match(calls.at(-1)!.source[0]!.text!, /Fisiología renal\. Los antiinflamatorios/)
  })

  test('PPTX: diapositivas en orden numérico, con notas y entidades XML decodificadas', async () => {
    const text = await extractPptx(await makePptx())
    assert.equal(
      text,
      'Diapositiva 1:\nParasitología bovina & ovina\n\nDiapositiva 2:\nCiclo de Fasciola hepatica\nHuésped intermediario: caracol Lymnaea\nNotas: El profe dijo que esto entra en el parcial\n\nDiapositiva 10:\nTratamiento: triclabendazol 12 mg/kg VO',
    )
  })

  test('PDF grande va por la File API; la cita del banco se usa como excerpt', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(20_000, 32)])
    const res = await postFile('AINEs.pdf', 'application/pdf', pdf)
    const done = await waitDone(((await res.json()) as { source: SourceDTO }).source.id)
    assert.equal(done.status, 'ready')
    assert.equal(uploads.length, 1)
    const part = calls.at(-1)!.source[0]!
    assert.equal(part.fileData?.mimeType, 'application/pdf')
    assert.match(part.fileData!.fileUri!, /files\/fake-1$/)
    assert.match(done.excerpt!, /^Cita literal/)
    // el archivo original se puede descargar
    const file = await fetch(`${base}/sources/${done.id}/file`)
    assert.equal(file.headers.get('content-type'), 'application/pdf')
  })

  test('splitPdf: partes contiguas que cubren todo el PDF y respetan el tamaño máximo', async () => {
    const pdf = await makePdf(40)
    assert.ok(pdf.length > 31_000, `el PDF de prueba debe superar el máximo (pesa ${pdf.length})`)
    const chunks = await splitPdf(pdf, 31_000)
    assert.ok(chunks.length >= 2)
    assert.equal(chunks[0]!.fromPage, 1)
    assert.equal(chunks.at(-1)!.toPage, 40)
    for (let i = 1; i < chunks.length; i++) assert.equal(chunks[i]!.fromPage, chunks[i - 1]!.toPage + 1)
    for (const c of chunks) assert.ok(c.bytes.length <= 31_000)
  })

  test('PDF de más del máximo: se divide, sube cada parte y le dice a Gemini qué páginas son', async () => {
    const before = uploads.length
    const res = await postFile('anatomía parcial 1.pdf', 'application/pdf', await makePdf(40))
    const done = await waitDone(((await res.json()) as { source: SourceDTO }).source.id)
    assert.equal(done.status, 'ready')
    const n = uploads.length - before
    assert.ok(n >= 2, `subió ${n} partes`)
    const parts = calls.at(-1)!.source
    assert.equal(parts.filter((p) => p.fileData).length, n)
    assert.match(parts[0]!.text!, /^PDF original, páginas 1 a \d+/)
    assert.match(parts.at(-2)!.text!, /a 40\. La primera página de este archivo es la página \d+ del original/)
  })

  test('foto pequeña va inline en base64 y expone miniatura', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200, 7)])
    const res = await postFile('apuntes.png', 'image/png', png)
    const done = await waitDone(((await res.json()) as { source: SourceDTO }).source.id)
    const part = calls.at(-1)!.source[0]!
    assert.equal(part.inlineData?.mimeType, 'image/png')
    assert.equal(Buffer.from(part.inlineData!.data!, 'base64').length, png.length)
    assert.equal(done.thumbnailUrl, `/api/sources/${done.id}/file`)
  })

  test('un .exe disfrazado de PDF → 400 UNSUPPORTED_FILE', async () => {
    const res = await postFile('parcial.pdf', 'application/pdf', Buffer.from('MZ\x90\x00 no soy un pdf'))
    assert.equal(res.status, 400)
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'UNSUPPORTED_FILE')
  })
})

describe('limpieza de la salida de Gemini', () => {
  test('cleanLocation quita la numeración de las partes', () => {
    assert.equal(cleanLocation('Página 54 (PDF 2, p. 16)'), 'Página 54')
    assert.equal(cleanLocation('Páginas 35 y 36 (PDF 2, p. 16 y 17)'), 'Páginas 35 y 36')
    assert.equal(cleanLocation('Diapositiva 12 (tabla)'), 'Diapositiva 12 (tabla)')
    assert.equal(cleanLocation('  '), null)
  })

  test('mergeTopics une variantes del mismo tema (casos reales del PDF de anatomía)', () => {
    const merged = mergeTopics([
      'Tegumento común y receptores cutáneos',
      'Estructuras córneas y cascos',
      'Cronometría dentaria comparada',
      'Faringe, esófago y deglución',
      'Hígado, vías biliares y páncreas',
      'Tegumento común y receptores sensoriales',
      'Anatomía del casco y estructuras anexas',
      'Cronometría y fórmulas dentarias comparadas',
      'Faringe, laringe y mecanismo de deglución',
      'Intestino delgado y grueso comparado',
    ])
    assert.deepEqual(merged, [
      'Tegumento común y receptores cutáneos',
      'Estructuras córneas y cascos',
      'Cronometría dentaria comparada',
      'Faringe, esófago y deglución',
      'Hígado, vías biliares y páncreas',
      'Intestino delgado y grueso comparado',
    ])
  })
})

describe('YouTube', () => {
  test('parsea todos los formatos de link', () => {
    for (const url of [
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share',
    ])
      assert.equal(parseYoutubeId(url), 'dQw4w9WgXcQ', url)
    assert.equal(parseYoutubeId('https://vimeo.com/123'), null)
    assert.equal(parseYoutubeId('no es un link'), null)
  })

  test('video público: título de oEmbed y fileUri a Gemini', async () => {
    const res = await postJson({ kind: 'youtube', url: 'https://youtu.be/AbCdEfGhIjK' })
    assert.equal(res.status, 202)
    const created = ((await res.json()) as { source: SourceDTO }).source
    assert.equal(created.title, 'Fisiología renal — clase 3')
    assert.equal(created.thumbnailUrl, 'https://i.ytimg.com/vi/AbCdEfGhIjK/hqdefault.jpg')
    await waitDone(created.id)
    assert.deepEqual(calls.at(-1)!.source[0], { fileData: { fileUri: 'https://www.youtube.com/watch?v=AbCdEfGhIjK' } })
  })

  test('video privado → 422 antes de llamar a Gemini', async () => {
    const before = calls.length
    const res = await postJson({ kind: 'youtube', url: 'https://youtu.be/PRIVADO1234' })
    assert.equal(res.status, 422)
    assert.match(((await res.json()) as { error: { message: string } }).error.message, /privado/)
    assert.equal(calls.length, before)
  })

  test('link que no es de YouTube → 400', async () => {
    const res = await postJson({ kind: 'youtube', url: 'https://vimeo.com/123456' })
    assert.equal(res.status, 400)
  })
})

describe('errores y reintentos', () => {
  test('429 dos veces y luego éxito: se reintenta solo y queda lista', async () => {
    let fails = 0
    behavior = async () => {
      if (fails++ < 2) throw Errors.aiBusy()
      return goodBatch()
    }
    const res = await postJson({ kind: 'text', text: `${LONG_TEXT} Variante para reintentos.` })
    const done = await waitDone(((await res.json()) as { source: SourceDTO }).source.id)
    assert.equal(done.status, 'ready')
    assert.ok(done.bank.total >= 24)
  })

  test('sin contenido suficiente → error amigable; "reintentar" la recupera', async () => {
    behavior = async () => ({ title: 'x', topics: ['x'], insufficientContent: true, questions: [] })
    const res = await postJson({ kind: 'text', text: `${LONG_TEXT} Variante sin contenido.` })
    const failed = await waitDone(((await res.json()) as { source: SourceDTO }).source.id)
    assert.equal(failed.status, 'error')
    assert.match(failed.errorMessage!, /suficiente contenido/)

    behavior = async () => goodBatch()
    const retry = await fetch(`${base}/sources/${failed.id}/retry`, { method: 'POST' })
    assert.equal(retry.status, 202)
    const done = await waitDone(failed.id)
    assert.equal(done.status, 'ready')
    assert.equal(done.errorMessage, null)
  })

  test('JSON con forma inválida se reintenta y al final marca error reintentable', async () => {
    behavior = async () => ({ nada: true })
    const res = await postJson({ kind: 'text', text: `${LONG_TEXT} Variante JSON roto.` })
    const failed = await waitDone(((await res.json()) as { source: SourceDTO }).source.id)
    assert.equal(failed.status, 'error')
    assert.match(failed.errorMessage!, /Reintentar/)
  })

  test('clasificación de errores del SDK', () => {
    const busy = classifyGeminiError(new ApiError({ message: 'Resource exhausted', status: 429 }))
    assert.equal(busy.code, 'AI_BUSY')
    assert.equal(busy.retryable, true)
    const overloaded = classifyGeminiError(new ApiError({ message: 'This model is currently experiencing high demand', status: 503 }))
    assert.equal(overloaded.code, 'AI_BUSY')
    assert.equal(overloaded.retryable, true)
    assert.ok(overloaded.cause instanceof ApiError, 'guarda el error crudo para los logs')
    assert.equal(classifyGeminiError(new ApiError({ message: 'internal', status: 500 })).retryable, true)
    assert.equal(
      classifyGeminiError(new ApiError({ message: 'Video is private or unavailable', status: 400 }), true).code,
      'VIDEO_UNAVAILABLE',
    )
    assert.equal(classifyGeminiError(new ApiError({ message: 'models/gemini-x is not found', status: 404 })).code, 'AI_MODEL')
    assert.equal(classifyGeminiError(new ApiError({ message: 'API key not valid', status: 400 })).code, 'AI_CONFIG')
    assert.equal(classifyGeminiError(new TypeError('fetch failed')).retryable, true)
  })

  test('id inválido → 404 y ruta inexistente → 404 JSON', async () => {
    assert.equal((await fetch(`${base}/sources/no-es-uuid`)).status, 404)
    const res = await fetch(`${base}/nada`)
    assert.equal(res.status, 404)
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'NOT_FOUND')
  })
})
