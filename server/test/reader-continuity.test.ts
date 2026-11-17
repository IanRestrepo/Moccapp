import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRenderer, defineComponent } from 'vue'
import { guideScript, useGuideReader } from '../../client/src/composables/useGuideReader.js'

const values = new Map<string, string>()
Object.assign(globalThis, { localStorage: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) } })
let deviceCalls = 0
Object.assign(globalThis, { window: { setTimeout, clearTimeout, speechSynthesis: { cancel() {}, getVoices: () => [], speak() { deviceCalls++ } } },
  document: { hidden: false, addEventListener() {}, removeEventListener() {} }, SpeechSynthesisUtterance: class {} })
class FakeAudio {
  static all: FakeAudio[] = []
  currentTime = 0; duration = 30; playbackRate = 1
  onended: (() => void) | null = null; onerror: (() => void) | null = null
  onloadedmetadata: (() => void) | null = null; ontimeupdate: (() => void) | null = null
  constructor(public src: string) { FakeAudio.all.push(this) }
  async play() { this.onloadedmetadata?.() }
  pause() {}
}
Object.assign(globalThis, { Audio: FakeAudio })
const renderer = createRenderer<any, any>({
  patchProp() {}, insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null,
})
const tick = () => new Promise(r => setTimeout(r, 10))
function mounted(key: string) {
  let reader!: ReturnType<typeof useGuideReader>
  const app = renderer.createApp(defineComponent({ setup() { reader = useGuideReader(key, 'source'); return () => null } }))
  app.mount({})
  reader.load([{ section: 0, paragraph: 0, text: 'Primer párrafo.' }, { section: 0, paragraph: 1, text: 'Segundo párrafo.' }])
  return { reader, app }
}
test('fallo de voz natural pausa sin cambiar a voz robótica ni avanzar texto', async () => {
  globalThis.fetch = async () => { throw Error('offline') }
  const { reader, app } = mounted('failure')
  reader.play(); await tick()
  assert.equal(reader.state.value, 'paused')
  assert.equal(reader.index.value, 0)
  assert.equal(reader.failed.value, true)
  assert.equal(reader.deviceVoice.value, false)
  assert.equal(deviceCalls, 0)
  app.unmount()
})
test('pausa conserva segundos y párrafo; solo onended avanza', async () => {
  const requested: string[] = []
  globalThis.fetch = async (_url, init) => { requested.push(JSON.parse(String(init?.body)).text); return new Response(new Blob(['audio'])) }
  const { reader, app } = mounted('resume')
  reader.play(); await tick()
  const audio = FakeAudio.all.at(-1)!
  assert.equal(requested[0], 'Primer párrafo.')
  audio.currentTime = 12; audio.ontimeupdate?.()
  reader.pause(); assert.equal(reader.index.value, 0)
  reader.play(); await tick()
  assert.equal(FakeAudio.all.at(-1)!.currentTime, 12)
  FakeAudio.all.at(-1)!.onended?.()
  assert.equal(reader.index.value, 1)
  app.unmount()
})
test('una respuesta de audio vieja no puede reanudar después de pausar', async () => {
  let resolve!: (r: Response) => void
  globalThis.fetch = () => new Promise(r => { resolve = r })
  const { reader, app } = mounted('race')
  const count = FakeAudio.all.length
  reader.play(); reader.pause()
  resolve(new Response(new Blob(['audio']))); await tick()
  assert.equal(FakeAudio.all.length, count)
  assert.equal(reader.state.value, 'paused')
  app.unmount()
})
test('el guion incluye cada párrafo y las celdas de tablas', () => {
  const script = guideScript('Guía', { overview: '', checklist: [], conceptMap: { center: '', branches: [] }, sections: [{
    title: 'Capítulo', summary: 'Primer párrafo.\n\nSegundo párrafo.', location: '', keyPoints: [], terms: [], tip: '', bankTopics: [], images: [],
    tables: [{ title: 'Funciones', columns: ['Órgano', 'Función'], rows: [['Ovario', 'Producir ovocitos']] }],
  }] })
  assert.ok(script.some(c => c.text.includes('Segundo párrafo')))
  assert.ok(script.some(c => c.text.includes('Producir ovocitos')))
})
