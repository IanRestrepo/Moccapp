// Sonidos cortos con Howler. Silenciables; la preferencia se guarda en el servidor y en el navegador.
import { Howl, Howler } from 'howler'
import { ref, watch } from 'vue'
import { api } from '@/api/client'

export type SoundName = 'tap' | 'select' | 'correct' | 'wrong' | 'tick' | 'finish' | 'perfect' | 'pop'

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
    h = new Howl({ src: [`/sounds/${name}.wav`], volume: name === 'tick' ? 0.35 : name === 'perfect' ? 0.85 : 0.6, preload: true })
    cache.set(name, h)
  }
  return h
}

export function useSound() {
  return {
    enabled,
    play: (name: SoundName) => enabled.value && howl(name).play(),
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
