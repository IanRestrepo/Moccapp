<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { motion, AnimatePresence } from 'motion-v'
import { PhHeart } from '@phosphor-icons/vue'
import MascotBlob, { type MascotMood } from '@/components/mascot/MascotBlob.vue'
import { useSound } from '@/composables/useSound'
import type { MoccaMessageDTO } from '@vetquiz/shared'
import { api } from '@/api/client'
import { LOVE_MESSAGES } from '@/lib/moccaMessages'

/**
 * Sorpresa: de vez en cuando Mocca se asoma por abajo con un mensaje de amor y se va.
 * Cuenta solo el tiempo con la app visible y nunca sale en medio de un examen con reloj.
 */
const props = withDefaults(defineProps<{ randomLove?: boolean }>(), { randomLove: true })
const route = useRoute()
const { play } = useSound()
const visible = ref(false)
const TICK_MS = 10_000

const MOODS: MascotMood[] = ['celebrating', 'happy', 'proud', 'amazed']
const message = ref(LOVE_MESSAGES[0]!)
const mood = ref<MascotMood>('celebrating')
/** id del mensajito de Ian que se está mostrando (null = mensaje al azar de Mocca) */
const fromIan = ref<string | null>(null)
let last = -1
// la primera vez, el de siempre; después, al azar sin repetir el anterior
function nextMessage() {
  let i = last === -1 ? 0 : Math.floor(Math.random() * LOVE_MESSAGES.length)
  if (i === last) i = (i + 1) % LOVE_MESSAGES.length
  last = i
  message.value = LOVE_MESSAGES[i]!
  mood.value = MOODS[Math.floor(Math.random() * MOODS.length)]!
  fromIan.value = null
}
// más tiempo si el mensaje es largo, para alcanzar a leerlo
const showMs = () => Math.max(fromIan.value ? 8_000 : 4_500, message.value.length * (fromIan.value ? 140 : 110))
const between = (minMin: number, maxMin: number) => (minMin + Math.random() * (maxMin - minMin)) * 60_000

let elapsed = 0
// la primera vez sale pronto; después, cada tanto
let waitFor = between(2, 4)
let ticker = 0
let hideTimer = 0

function show() {
  nextMessage()
  reveal()
}
function reveal() {
  visible.value = true
  play('pop')
  hideTimer = window.setTimeout(hide, showMs())
}
function hide() {
  clearTimeout(hideTimer)
  visible.value = false
  // el de Ian queda "visto" en su panel
  if (fromIan.value) api.messageSeen(fromIan.value).catch(() => {})
  fromIan.value = null
  setTimeout(nextFromIan, 1_500)
}

// ── Mensajitos de Ian (llegan con la señal de vida, ver App.vue) ──
const queue: MoccaMessageDTO[] = []
const seenIds = new Set<string>()
const canShow = () =>
  !visible.value && document.visibilityState === 'visible' && !route.path.startsWith('/examen/') && !route.path.startsWith('/admin')
function nextFromIan() {
  if (!queue.length || !canShow()) return
  const m = queue.shift()!
  message.value = m.text
  mood.value = m.mood
  fromIan.value = m.id
  reveal()
}
function onIanMessage(e: Event) {
  const m = (e as CustomEvent<MoccaMessageDTO>).detail
  if (!m?.id || seenIds.has(m.id)) return
  seenIds.add(m.id)
  queue.push(m)
  nextFromIan()
}
onMounted(() => window.addEventListener('vq:mocca-message', onIanMessage))
onBeforeUnmount(() => window.removeEventListener('vq:mocca-message', onIanMessage))
// si llegó durante un examen, sale apenas termine
watch(() => route.path, () => setTimeout(nextFromIan, 1_200))

// para probarlo a mano: window.dispatchEvent(new Event('vq:mocca-love'))
const showNow = () => !visible.value && show()
onMounted(() => window.addEventListener('vq:mocca-love', showNow))
onBeforeUnmount(() => window.removeEventListener('vq:mocca-love', showNow))

onMounted(() => {
  ticker = window.setInterval(() => {
    if (document.visibilityState !== 'visible' || visible.value) return
    if (queue.length) return nextFromIan()
    if (!props.randomLove) return
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
        :class="[
          'relative mb-1 mr-6 max-w-[260px] rounded-[20px] rounded-br-none px-4 py-3 text-left font-display text-[17px] font-extrabold leading-snug text-on-color shadow-float',
          fromIan ? 'bg-lilac' : 'bg-pink',
        ]"
        :initial="{ scale: 0, opacity: 0 }"
        :animate="{ scale: 1, opacity: 1 }"
        :transition="{ delay: 0.35, type: 'spring', stiffness: 400, damping: 20 }"
      >
        <span v-if="fromIan" class="mb-0.5 block text-[12px] font-extrabold uppercase tracking-wide opacity-70">💌 De Ian</span>
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
