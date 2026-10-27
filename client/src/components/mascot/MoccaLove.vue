<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { motion, AnimatePresence } from 'motion-v'
import { PhHeart } from '@phosphor-icons/vue'
import MascotBlob, { type MascotMood } from '@/components/mascot/MascotBlob.vue'
import { useSound } from '@/composables/useSound'

/**
 * Sorpresa: de vez en cuando Mocca se asoma por abajo con un mensaje de amor y se va.
 * Cuenta solo el tiempo con la app visible y nunca sale en medio de un examen con reloj.
 */
const route = useRoute()
const { play } = useSound()
const visible = ref(false)
const TICK_MS = 10_000

/** Lo que le dice Mocca (de parte de Ian y suya). Sale uno distinto cada vez. */
const MESSAGES = [
  'Ian & yo te amamos Ash',
  'Ian está muy orgulloso de ti',
  'Eres la futura mejor veterinaria del mundo 🐾',
  'Respira. Tú puedes con esto 💪',
  'Cada pregunta te acerca un poquito más a tu sueño',
  'No importa la nota: ya estamos orgullosos de ti',
  'Ian te manda un abrazo gigante 🤗',
  'Los animalitos van a tener mucha suerte contigo',
  'Eres más inteligente de lo que crees, Ash',
  'Cuando seas la doctora Ash, yo seré tu primera paciente 🐶',
  'Un descansito, un vaso de agua y seguimos 💧',
  'Ian dice que eres su persona favorita',
  'Te amamos hasta la luna y de vuelta 🌙',
  'Paso a paso, Ash. Así se llega lejos',
  '¡Guau! Hoy estás estudiando increíble',
  '¿Ya comiste algo rico? Cuídate, que te queremos',
  'Estudiar contigo es mi parte favorita del día',
  'Admiramos lo mucho que te esfuerzas',
  'Mocca y Ian creen en ti, siempre',
  'Tú puedes, Ash. Siempre has podido 💜',
]
const MOODS: MascotMood[] = ['celebrating', 'happy', 'proud', 'amazed']
const message = ref(MESSAGES[0]!)
const mood = ref<MascotMood>('celebrating')
let last = -1
// la primera vez, el de siempre; después, al azar sin repetir el anterior
function nextMessage() {
  let i = last === -1 ? 0 : Math.floor(Math.random() * MESSAGES.length)
  if (i === last) i = (i + 1) % MESSAGES.length
  last = i
  message.value = MESSAGES[i]!
  mood.value = MOODS[Math.floor(Math.random() * MOODS.length)]!
}
// más tiempo si el mensaje es largo, para alcanzar a leerlo
const showMs = () => Math.max(4_500, message.value.length * 110)
const between = (minMin: number, maxMin: number) => (minMin + Math.random() * (maxMin - minMin)) * 60_000

let elapsed = 0
// la primera vez sale pronto; después, cada tanto
let waitFor = between(2, 4)
let ticker = 0
let hideTimer = 0

function show() {
  nextMessage()
  visible.value = true
  play('pop')
  hideTimer = window.setTimeout(hide, showMs())
}
function hide() {
  clearTimeout(hideTimer)
  visible.value = false
}

// para probarlo a mano: window.dispatchEvent(new Event('vq:mocca-love'))
const showNow = () => !visible.value && show()
onMounted(() => window.addEventListener('vq:mocca-love', showNow))
onBeforeUnmount(() => window.removeEventListener('vq:mocca-love', showNow))

onMounted(() => {
  ticker = window.setInterval(() => {
    if (document.visibilityState !== 'visible' || visible.value) return
    elapsed += TICK_MS
    if (elapsed < waitFor || route.path.startsWith('/examen/') || route.path.startsWith('/admin')) return
    elapsed = 0
    waitFor = between(7, 15)
    show()
  }, TICK_MS)
})
onBeforeUnmount(() => {
  clearInterval(ticker)
  clearTimeout(hideTimer)
})

const HEARTS = [
  { x: -30, delay: 0.2, size: 18 },
  { x: 10, delay: 0.6, size: 24 },
  { x: 40, delay: 1, size: 16 },
  { x: -5, delay: 1.5, size: 20 },
]
</script>

<template>
  <AnimatePresence>
    <motion.button
      v-if="visible"
      type="button"
      class="fixed bottom-24 right-3 z-[60] flex flex-col items-end"
:aria-label="`Mensaje de Mocca: ${message}. Toca para cerrar.`"
      :initial="{ y: 220, rotate: 12 }"
      :animate="{ y: 0, rotate: 0 }"
      :exit="{ y: 240, rotate: -10 }"
      :transition="{ type: 'spring', stiffness: 260, damping: 18 }"
      @click="hide"
    >
      <motion.span
        class="relative mb-1 mr-6 max-w-[250px] rounded-[20px] rounded-br-none bg-pink px-4 py-3 text-left font-display text-[17px] font-extrabold leading-snug text-on-color shadow-float"
        :initial="{ scale: 0, opacity: 0 }"
        :animate="{ scale: 1, opacity: 1 }"
        :transition="{ delay: 0.35, type: 'spring', stiffness: 400, damping: 20 }"
      >
        {{ message }}
        <PhHeart class="ml-1 inline align-[-3px]" :size="18" weight="fill" />
      </motion.span>
      <span class="relative">
        <motion.span
          v-for="(h, i) in HEARTS"
          :key="i"
          class="pointer-events-none absolute left-1/2 top-4 text-pink"
          :initial="{ y: 0, x: h.x, opacity: 0, scale: 0.5 }"
          :animate="{ y: -110, opacity: [0, 1, 0], scale: 1 }"
          :transition="{ duration: 1.8, delay: h.delay, repeat: Infinity, repeatDelay: 0.4 }"
        >
          <PhHeart :size="h.size" weight="fill" />
        </motion.span>
        <MascotBlob :mood="mood" :size="120" />
      </span>
    </motion.button>
  </AnimatePresence>
</template>
