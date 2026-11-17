// La guía como audiolibro, con la voz del propio celular (gratis, sin internet extra y al instante).
// Se lee en pedazos cortos (los celulares cortan las frases muy largas) y se puede pausar, saltar de tema y cambiar
// la velocidad. Mientras suena, la pantalla no se apaga (si se bloquea, el celular deja de leer).
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { StudyGuide } from '@vetquiz/shared'
import { paragraphs } from '../lib/richText'

export interface ReadChunk {
  /** -1 = introducción; 0… = tema */
  section: number
  paragraph?: number
  text: string
  /** Silencio después de esta frase, en milisegundos. */
  pauseAfter?: number
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
  let paragraph = 0
  const add = (section: number, text: string, pauseAfter = 220) => {
    const block = paragraph++
    const phrases = splitSpeech(text)
    phrases.forEach((t, index) => chunks.push({
      section,
      paragraph: block,
      text: t,
      pauseAfter: index === phrases.length - 1 ? pauseAfter : /[.!?]$/.test(t) ? 160 : 80,
    }))
  }
  add(-1, `Guía de estudio: ${title}.`)
  paragraphs(g.overview).forEach((p) => add(-1, p))
  g.sections.forEach((s, i) => {
    add(i, `Tema ${i + 1}. ${s.title}.`, 350)
    paragraphs(s.summary).forEach((p) => add(i, p))
    if (s.keyPoints.length) {
      add(i, 'Las ideas principales son las siguientes.', 180)
      s.keyPoints.forEach((k) => add(i, k.endsWith('.') ? k : `${k}.`))
    }
    if (s.terms.length) {
      add(i, 'Repasemos los términos importantes.', 180)
      s.terms.forEach((t) => add(i, `${t.term}: ${t.definition}`))
    }
    for (const table of s.tables) {
      add(i, table.title)
      table.rows.forEach(row => add(i, row.map((cell, column) => `${table.columns[column] ?? ''}: ${cell}`).join('. ')))
    }
    if (s.tip) add(i, `Truco para recordar: ${s.tip}`)
    // Reutiliza las ideas de la guía: no inventa conclusiones ni corta palabras.
    const ideas = s.keyPoints.length ? s.keyPoints : paragraphs(s.summary)
    const recap: string[] = []
    for (const idea of ideas) {
      const first = splitSpeech(idea, 10000)[0]
      if (!first || recap.includes(first)) continue
      if (recap.length && recap.join(' ').length + first.length > 420) break
      recap.push(/[.!?]$/.test(first) ? first : `${first}.`)
      if (recap.length === 2) break
    }
    if (recap.length) {
      add(i, `Para cerrar este tema, recordemos lo esencial.`, 180)
      add(i, recap.join(' '), 550)
    } else if (chunks.length) {
      chunks[chunks.length - 1]!.pauseAfter = 550
    }
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
    if (/natural|neural|enhanced|premium/i.test(v.name)) s += 12
    else if (/siri|google/i.test(v.name)) s += 7
    // voces claras conocidas (iPhone/Mac, Android, Windows)
    if (/paulina|m[oó]nica|marisol|juan|diego|jorge|dalia|sabina|salome|salom[eé]|gonzalo|helena|laura|pablo|microsoft/i.test(v.name)) s += 2
    // voces de juguete de Apple: nunca
    if (/grandma|grandpa|rocko|shelley|bahh|bells|boing|bubbles|jester|organ|trinoids|whisper|zarvox|albert|bad news|good news|cellos|superstar|wobble/i.test(v.name)) s -= 20
    if (v.localService) s += 1
    return s
  }
  return [...voices].sort((a, b) => score(b) - score(a))[0]!
}

const RATES = [0.85, 0.95, 1, 1.15, 1.3, 1.5]

export function useGuideReader(storageKey: string, sourceId?: string) {
  const hasDeviceSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  const supported = !!sourceId || hasDeviceSpeech
  const chunks = ref<ReadChunk[]>([])
  const index = ref(0)
  const state = ref<'idle' | 'playing' | 'paused'>('idle')
  const savedRate = Number(safeGet(`${storageKey}-rate`))
  const rate = ref(RATES.includes(savedRate) ? savedRate : 0.95)
  /** El celular no empezó a hablar (sin voces o bloqueado): se avisa en vez de quedarse "sonando" en silencio */
  const failed = ref(false)
  const preparing = ref(false)
  const deviceVoice = ref(false)
  let audio: HTMLAudioElement | null = null
  let audioUrl: string | null = null
  let resumeAt = 0
  let scriptVersion = 0
  let lockedVoice: SpeechSynthesisVoice | null = null
  const persist = () => {
    safeSet(`${storageKey}-pos`, String(index.value))
    safeSet(`${storageKey}-offset`, String(resumeAt))
  }
  const audioCache = new Map<number, Blob>()
  const pendingAudio = new Map<number, Promise<Blob>>()
  // Une frases del mismo tema: el motor resuelve la entonación dentro del bloque.
  function batch(at: number) {
    const first = chunks.value[at]!
    let text = first.text
    let end = at
    while (end + 1 < chunks.value.length) {
      const next = chunks.value[end + 1]!
      if (next.paragraph !== first.paragraph || next.section !== first.section || text.length + next.text.length + 2 > 1100) break
      text += ((chunks.value[end]!.pauseAfter ?? 0) >= 220 ? '\n\n' : ' ') + next.text
      end++
    }
    return { text, end }
  }
  async function getAudio(at: number): Promise<Blob> {
    const cached = audioCache.get(at)
    if (cached) return cached
    const pending = pendingAudio.get(at)
    if (pending) return pending
    const version = scriptVersion
    const text = batch(at).text
    const task = (async () => {
      const response = await fetch(`/api/guide/${sourceId}/narration`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }), signal: AbortSignal.timeout(50000),
      })
      if (!response.ok) throw new Error('Voice unavailable')
      const blob = await response.blob()
      if (audioCache.size >= 8) audioCache.delete(audioCache.keys().next().value!)
      if (version === scriptVersion) audioCache.set(at, blob)
      return blob
    })()
    pendingAudio.set(at, task)
    try { return await task } finally { if (version === scriptVersion) pendingAudio.delete(at) }
  }
  function cancelAudio() {
    if (audio) { audio.onended = null; audio.onerror = null; audio.ontimeupdate = null; audio.pause(); audio = null }
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    audioUrl = null
    preparing.value = false
  }
  async function naturalSpeech(my: number) {
    preparing.value = true
    clearTimeout(watchdog)
    const at = index.value
    const { end } = batch(at)
    try {
      const blob = await getAudio(at)
      if (my !== token || state.value !== 'playing') return
      audioUrl = URL.createObjectURL(blob)
      audio = new Audio(audioUrl)
      audio.playbackRate = rate.value
      audio.onloadedmetadata = () => {
        if (my === token && audio && resumeAt > 0 && resumeAt < audio.duration) audio.currentTime = resumeAt
      }
      audio.ontimeupdate = () => {
        if (my === token && audio) { resumeAt = audio.currentTime; persist() }
      }
      audio.onended = () => {
        if (my !== token || state.value !== 'playing') return
        cancelAudio()
        index.value = end
        advance(my, chunks.value[end]!)
      }
      audio.onerror = () => failPlayback()
      await audio.play()
      if (my === token) {
        preparing.value = false
        started = true
        // Prepara solo el bloque siguiente mientras suena el actual.
        if (end + 1 < chunks.value.length) void getAudio(end + 1).catch(() => {})
      }
    } catch {
      if (my === token) failPlayback()
    }
    function failPlayback() {
      if (my !== token || state.value !== 'playing') return
      pause()
      failed.value = true
    }
  }
  function advance(my: number, chunk: ReadChunk) {
    index.value++
    resumeAt = 0
    persist()
    if (index.value >= chunks.value.length) return stop(true)
    nextPhraseTimer = window.setTimeout(
      () => my === token && state.value === 'playing' && speak(),
      sourceId && !deviceVoice.value
        ? (chunks.value[index.value]?.section !== chunk.section ? 350 : 60)
        : Math.max(chunk.pauseAfter ?? 160, chunks.value[index.value]?.section !== chunk.section ? 550 : 0),
    )
  }
  let started = false
  let watchdog = 0
  let nextPhraseTimer = 0
  let token = 0
  let wake: { release: () => Promise<void> } | null = null

  const current = computed(() => chunks.value[index.value] ?? null)
  const section = computed(() => current.value?.section ?? -1)
  const progress = computed(() => (chunks.value.length ? index.value / chunks.value.length : 0))
  const sectionCount = computed(() => Math.max(0, ...chunks.value.map((c) => c.section + 1)))

  function load(c: ReadChunk[]) {
    stop()
    scriptVersion++
    audioCache.clear()
    pendingAudio.clear()
    const signature = c.reduce((hash, chunk) => {
      for (const char of chunk.text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
      return hash
    }, 2166136261).toString(16)
    if (safeGet(`${storageKey}-script`) !== signature) {
      safeSet(`${storageKey}-pos`, '0')
      safeSet(`${storageKey}-offset`, '0')
      safeSet(`${storageKey}-script`, signature)
    }
    chunks.value = c
    resumeAt = Math.max(0, Number(safeGet(`${storageKey}-offset`)) || 0)
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
    if (sourceId && !deviceVoice.value) {
      void naturalSpeech(my)
      mediaSession()
      return
    }
    const u = new SpeechSynthesisUtterance(chunk.text)
    if (!lockedVoice) {
      const preferred = safeGet(`${storageKey}-voice`)
      lockedVoice = window.speechSynthesis.getVoices().find(v => v.voiceURI === preferred) ?? bestVoice()
      if (lockedVoice) safeSet(`${storageKey}-voice`, lockedVoice.voiceURI)
    }
    const voice = lockedVoice
    if (!voice) { pause(); failed.value = true; return }
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'es-CO'
    u.rate = rate.value
    u.pitch = 1
    u.volume = 1
    u.onstart = () => {
      started = true
      failed.value = false
    }
    u.onend = () => {
      if (my !== token || state.value !== 'playing') return
      advance(my, chunk)
    }
    u.onerror = (e) => {
      // Un error pausa en el mismo fragmento: nunca saltarlo.
      if (my !== token || e.error === 'interrupted' || e.error === 'canceled') return
      pause()
      failed.value = true
    }
    window.speechSynthesis.speak(u)
    mediaSession()
  }

  function play(fromSection?: number) {
    if (!supported || !chunks.value.length) return
    token++
    cancelAudio()
    clearTimeout(nextPhraseTimer)
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
      if (at >= 0) { index.value = at; resumeAt = 0; persist() }
    }
    if (index.value >= chunks.value.length) index.value = 0
    // en algunos Android hay que "despertar" el motor antes de hablar
    if (hasDeviceSpeech) window.speechSynthesis.cancel()
    state.value = 'playing'
    void keepAwake(true)
    speak()
  }

  /** Pausar = cortar y recordar el pedazo (el pause() nativo falla en varios celulares) */
  function pause() {
    clearTimeout(nextPhraseTimer)
    clearTimeout(watchdog)
    token++
    if (audio) resumeAt = audio.currentTime
    persist()
    cancelAudio()
    if (hasDeviceSpeech) window.speechSynthesis.cancel()
    state.value = 'paused'
    void keepAwake(false)
    mediaSession()
  }

  function stop(finished = false) {
    clearTimeout(nextPhraseTimer)
    clearTimeout(watchdog)
    token++
    cancelAudio()
    if (hasDeviceSpeech) window.speechSynthesis.cancel()
    state.value = 'idle'
    if (finished) {
      index.value = 0
      resumeAt = 0
      persist()
    }
    void keepAwake(false)
  }

  const toggle = () => (state.value === 'playing' ? pause() : play())

  function jump(delta: number) {
    resumeAt = 0
    const s = section.value + delta
    const at = chunks.value.findIndex((c) => c.section === s)
    if (delta < 0 && s < -1) index.value = 0
    else if (at >= 0) index.value = at
    else if (delta > 0) return stop(true)
    persist()
    if (state.value === 'playing') play()
  }

  /** La velocidad nueva aplica desde la frase siguiente: cortar la actual sonaba a "volver a empezar" */
  function cycleRate() {
    rate.value = RATES[(RATES.indexOf(rate.value) + 1) % RATES.length] ?? 1
    safeSet(`${storageKey}-rate`, String(rate.value))
    if (audio) audio.playbackRate = rate.value
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
  const onHidden = () => { if (document.hidden && state.value === 'playing') pause() }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHidden)
  onBeforeUnmount(() => {
    if (audio) resumeAt = audio.currentTime
    persist()
    stop()
    document.removeEventListener('visibilitychange', onHidden)
  })
  if (hasDeviceSpeech) window.speechSynthesis.getVoices()
  watch(state, (s) => s === 'idle' && void keepAwake(false))

  return { supported, failed, preparing, deviceVoice, chunks, index, state, rate, current, section, progress, sectionCount, load, play, pause, stop, toggle, jump, cycleRate, setTitles }
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
