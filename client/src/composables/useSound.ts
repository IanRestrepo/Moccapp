// Sonidos cortos con Howler. Silenciables; la preferencia se guarda en el servidor y en el navegador.
import { Howl, Howler } from 'howler'
import { ref, watch } from 'vue'
import { api } from '@/api/client'

/** perfectScene: la música de la escena del examen perfecto, hecha a su medida (scripts/gen-perfect-scene.mjs) */
export type SoundName = 'tap' | 'select' | 'correct' | 'wrong' | 'tick' | 'finish' | 'perfect' | 'pop' | 'perfectScene'

const readPref = () => {
  try {
    return localStorage.getItem('vq-sound') !== 'off'
  } catch {
    return true
  }
}

const enabled = ref(readPref())
const cache = new Map<SoundName, Howl>()

watch(enabled, (on) => {
  Howler.mute(!on)
  try {
    localStorage.setItem('vq-sound', on ? 'on' : 'off')
  } catch {}
})
Howler.mute(!enabled.value)

function howl(name: SoundName): Howl {
  let h = cache.get(name)
  if (!h) {
    h = new Howl({ src: [`/sounds/${name}.wav`], volume: name === 'tick' ? 0.35 : name === 'perfect' || name === 'perfectScene' ? 0.85 : 0.6, preload: true })
    cache.set(name, h)
  }
  return h
}

export function useSound() {
  return {
    enabled,
    play: (name: SoundName) => enabled.value && howl(name).play(),
    /** Lo deja cargado; la promesa se cumple cuando ya puede sonar (o si falla, igual: nunca bloquea) */
    ready: (name: SoundName) =>
      new Promise<void>((resolve) => {
        const h = howl(name)
        if (h.state() === 'loaded') return resolve()
        h.once('load', () => resolve())
        h.once('loaderror', () => resolve())
      }),
    /** Lo calla con un desvanecido corto */
    stop(name: SoundName) {
      const h = cache.get(name)
      if (!h || !h.playing()) return
      h.fade(h.volume(), 0, 180)
      h.once('fade', () => {
        h.stop()
        h.volume(0.85)
      })
    },
    async toggle() {
      enabled.value = !enabled.value
      api.updateStats({ soundEnabled: enabled.value }).catch(() => {})
    },
    /** Al cargar stats del servidor, gana la preferencia guardada allá */
    syncFromServer(on: boolean) {
      enabled.value = on
    },
  }
}
