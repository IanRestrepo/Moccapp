// La guía como audiolibro, con la voz del propio celular (gratis, sin internet extra y al instante).
// Se lee en pedazos cortos (los celulares cortan las frases muy largas) y se puede pausar, saltar de tema y cambiar
// la velocidad. Mientras suena, la pantalla no se apaga (si se bloquea, el celular deja de leer).
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { StudyGuide } from '@vetquiz/shared'
import { paragraphs } from '@/lib/richText'

export interface ReadChunk {
  /** -1 = introducción; 0… = tema */
  section: number
  text: string
}

const plain = (s: string) =>
  s
    .replace(/\*\*/g, '')
    .replace(/[•·]/g, ',')
    .replace(/\s+/g, ' ')
    .trim()

/** Parte un texto en frases de máx. ~200 caracteres (cortando por puntos, luego comas) */
export function splitSpeech(text: string, max = 200): string[] {
  const out: string[] = []
  // "2.5 mg", "Dr.", "p. ej." no terminan la frase
  const DOT = '\u2024'
  const safe = plain(text)
    .replace(/(\d)\.(\d)/g, `$1${DOT}$2`)
    .replace(/\bp\. ?ej\./gi, `p${DOT} ej${DOT}`)
    .replace(/\b(Dr|Dra|Sr|Sra|etc|ej|aprox|pág|págs|vol|fig|vs)\./gi, `$1${DOT}`)
  for (const sentence of safe.match(/[^.!?¿¡]+[.!?]*|[¿¡][^?!]+[?!]/g) ?? []) {
    let s = sentence.trim().replaceAll(DOT, '.')
    while (s.length > max) {
      // mejor en una coma o punto y coma; si no hay, en un espacio
      const comma = Math.max(s.lastIndexOf(', ', max), s.lastIndexOf('; ', max))
      const cut = comma > 60 ? comma : s.lastIndexOf(' ', max)
      const at = cut > 40 ? cut + 1 : max
      out.push(s.slice(0, at).trim())
      s = s.slice(at).trim()
    }
    if (s) out.push(s)
  }
  return out
}

/** Lo que se lee: intro, y por tema: título, explicación, lo que no puede faltar, términos y el truco */
export function guideScript(title: string, g: StudyGuide): ReadChunk[] {
  const chunks: ReadChunk[] = []
  const add = (section: number, text: string) => splitSpeech(text).forEach((t) => chunks.push({ section, text: t }))
  add(-1, `Guía de estudio: ${title}.`)
  paragraphs(g.overview).forEach((p) => add(-1, p))
  g.sections.forEach((s, i) => {
    add(i, `Tema ${i + 1}. ${s.title}.`)
    paragraphs(s.summary).forEach((p) => add(i, p))
    if (s.keyPoints.length) {
      add(i, 'Lo que no puede faltar.')
      s.keyPoints.forEach((k) => add(i, k.endsWith('.') ? k : `${k}.`))
    }
    if (s.terms.length) {
      add(i, 'Términos.')
      s.terms.forEach((t) => add(i, `${t.term}: ${t.definition}`))
    }
    if (s.tip) add(i, `Truco para recordar: ${s.tip}`)
  })
  return chunks
}

/** La mejor voz en español que tenga el celular: primero las de Latinoamérica y las "naturales" */
function bestVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'))
  if (!voices.length) return null
  const score = (v: SpeechSynthesisVoice) => {
    const lang = v.lang.toLowerCase()
    let s = 0
    if (/es[-_](co)/.test(lang)) s += 6
    else if (/es[-_](mx|us|419|ar|cl|pe)/.test(lang)) s += 4
    else if (/es[-_]es/.test(lang)) s += 1
    if (/natural|neural|enhanced|premium|siri|google/i.test(v.name)) s += 3
    // voces claras conocidas (iPhone/Mac, Android, Windows)
    if (/paulina|m[oó]nica|marisol|juan|diego|jorge|dalia|sabina|salome|salom[eé]|gonzalo|helena|laura|pablo|microsoft/i.test(v.name)) s += 2
    // voces de juguete de Apple: nunca
    if (/grandma|grandpa|rocko|shelley|bahh|bells|boing|bubbles|jester|organ|trinoids|whisper|zarvox|albert|bad news|good news|cellos|superstar|wobble/i.test(v.name)) s -= 20
    if (v.localService) s += 1
    return s
  }
  return [...voices].sort((a, b) => score(b) - score(a))[0]!
}

const RATES = [0.85, 1, 1.15, 1.3, 1.5]

export function useGuideReader(storageKey: string) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  const chunks = ref<ReadChunk[]>([])
  const index = ref(0)
  const state = ref<'idle' | 'playing' | 'paused'>('idle')
  const rate = ref(Number(safeGet(`${storageKey}-rate`)) || 1)
  /** El celular no empezó a hablar (sin voces o bloqueado): se avisa en vez de quedarse "sonando" en silencio */
  const failed = ref(false)
  let started = false
  let watchdog = 0
  let token = 0
  let wake: { release: () => Promise<void> } | null = null

  const current = computed(() => chunks.value[index.value] ?? null)
  const section = computed(() => current.value?.section ?? -1)
  const progress = computed(() => (chunks.value.length ? index.value / chunks.value.length : 0))
  const sectionCount = computed(() => Math.max(0, ...chunks.value.map((c) => c.section + 1)))

  function load(c: ReadChunk[]) {
    chunks.value = c
    const saved = Number(safeGet(`${storageKey}-pos`))
    index.value = Number.isInteger(saved) && saved > 0 && saved < c.length ? saved : 0
  }

  async function keepAwake(on: boolean) {
    try {
      if (on && !wake && 'wakeLock' in navigator) wake = await (navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<typeof wake> } }).wakeLock.request('screen')
      if (!on && wake) {
        await wake.release()
        wake = null
      }
    } catch {
      /* el navegador no lo permite: igual sigue leyendo */
    }
  }

  function speak() {
    const my = ++token
    const chunk = chunks.value[index.value]
    if (!chunk) return stop(true)
    const u = new SpeechSynthesisUtterance(chunk.text)
    const voice = bestVoice()
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'es-CO'
    u.rate = rate.value
    u.onstart = () => {
      started = true
      failed.value = false
    }
    u.onend = () => {
      if (my !== token || state.value !== 'playing') return
      index.value++
      safeSet(`${storageKey}-pos`, String(index.value))
      // una pausita entre temas
      const nextIsNewTopic = chunks.value[index.value]?.section !== chunk.section
      setTimeout(() => my === token && state.value === 'playing' && speak(), nextIsNewTopic ? 700 : 120)
    }
    u.onerror = (e) => {
      // "interrupted"/"canceled" son nuestras pausas; otro error: se salta ese pedazo
      if (my !== token || e.error === 'interrupted' || e.error === 'canceled') return
      index.value++
      if (state.value === 'playing') speak()
    }
    window.speechSynthesis.speak(u)
    mediaSession()
  }

  function play(fromSection?: number) {
    if (!supported || !chunks.value.length) return
    failed.value = false
    started = false
    clearTimeout(watchdog)
    watchdog = window.setTimeout(() => {
      if (!started && state.value === 'playing') {
        stop()
        failed.value = true
      }
    }, 4000)
    if (fromSection !== undefined) {
      const at = chunks.value.findIndex((c) => c.section === fromSection)
      if (at >= 0) index.value = at
    }
    if (index.value >= chunks.value.length) index.value = 0
    // en algunos Android hay que "despertar" el motor antes de hablar
    window.speechSynthesis.cancel()
    state.value = 'playing'
    void keepAwake(true)
    speak()
  }

  /** Pausar = cortar y recordar el pedazo (el pause() nativo falla en varios celulares) */
  function pause() {
    token++
    window.speechSynthesis.cancel()
    state.value = 'paused'
    void keepAwake(false)
    mediaSession()
  }

  function stop(finished = false) {
    token++
    if (supported) window.speechSynthesis.cancel()
    state.value = 'idle'
    if (finished) {
      index.value = 0
      safeSet(`${storageKey}-pos`, '0')
    }
    void keepAwake(false)
  }

  const toggle = () => (state.value === 'playing' ? pause() : play())

  function jump(delta: number) {
    const s = section.value + delta
    const at = chunks.value.findIndex((c) => c.section === s)
    if (delta < 0 && s < -1) index.value = 0
    else if (at >= 0) index.value = at
    else if (delta > 0) return stop(true)
    if (state.value === 'playing') play()
    else safeSet(`${storageKey}-pos`, String(index.value))
  }

  /** La velocidad nueva aplica desde la frase siguiente: cortar la actual sonaba a "volver a empezar" */
  function cycleRate() {
    rate.value = RATES[(RATES.indexOf(rate.value) + 1) % RATES.length] ?? 1
    safeSet(`${storageKey}-rate`, String(rate.value))
  }

  /** Controles en la pantalla de bloqueo / audífonos, donde el celular los muestre */
  let titleFor: (s: number) => string = () => ''
  const setTitles = (fn: (s: number) => string) => (titleFor = fn)
  function mediaSession() {
    const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession
    if (!ms || typeof MediaMetadata === 'undefined') return
    try {
      ms.metadata = new MediaMetadata({ title: titleFor(section.value), artist: 'Mocca te lee', album: 'Moccapp' })
      ms.playbackState = state.value === 'playing' ? 'playing' : 'paused'
      ms.setActionHandler('play', () => play())
      ms.setActionHandler('pause', () => pause())
      ms.setActionHandler('nexttrack', () => jump(1))
      ms.setActionHandler('previoustrack', () => jump(-1))
    } catch {
      /* sin controles: no pasa nada */
    }
  }

  // si cambia de pantalla o cierra, se calla
  onBeforeUnmount(() => stop())
  if (supported) window.speechSynthesis.getVoices()
  watch(state, (s) => s === 'idle' && void keepAwake(false))

  return { supported, failed, chunks, index, state, rate, current, section, progress, sectionCount, load, play, pause, stop, toggle, jump, cycleRate, setTitles }
}

function safeGet(k: string) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento */
  }
}
