<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { motion, AnimatePresence } from 'motion-v'
import { PhHeart } from '@phosphor-icons/vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import { useSound } from '@/composables/useSound'

/**
 * Sorpresa: de vez en cuando Mocca se asoma por abajo con un mensaje de amor y se va.
 * Cuenta solo el tiempo con la app visible y nunca sale en medio de un examen con reloj.
 */
const route = useRoute()
const { play } = useSound()
const visible = ref(false)
const TICK_MS = 10_000
const SHOW_MS = 4_500
const between = (minMin: number, maxMin: number) => (minMin + Math.random() * (maxMin - minMin)) * 60_000

let elapsed = 0
// la primera vez sale pronto; después, cada tanto
let waitFor = between(2, 4)
let ticker = 0
let hideTimer = 0

function show() {
  visible.value = true
  play('pop')
  hideTimer = window.setTimeout(hide, SHOW_MS)
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
      aria-label="Mensaje de Mocca: Ian y yo te amamos, Ash. Toca para cerrar."
      :initial="{ y: 220, rotate: 12 }"
      :animate="{ y: 0, rotate: 0 }"
      :exit="{ y: 240, rotate: -10 }"
      :transition="{ type: 'spring', stiffness: 260, damping: 18 }"
      @click="hide"
    >
      <motion.span
        class="relative mb-1 mr-6 rounded-[20px] rounded-br-none bg-pink px-4 py-3 font-display text-[17px] font-extrabold text-on-color shadow-float"
        :initial="{ scale: 0, opacity: 0 }"
        :animate="{ scale: 1, opacity: 1 }"
        :transition="{ delay: 0.35, type: 'spring', stiffness: 400, damping: 20 }"
      >
        Ian &amp; yo te amamos Ash
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
        <MascotBlob mood="celebrating" :size="120" />
      </span>
    </motion.button>
  </AnimatePresence>
</template>
