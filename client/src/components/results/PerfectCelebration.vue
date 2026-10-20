<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import confetti from 'canvas-confetti'
import { PhLightning, PhTarget, PhTimer } from '@phosphor-icons/vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import StickerIcon from '@/components/StickerIcon.vue'
import { clock } from '@/lib/format'
import { spring } from '@/lib/motion'
import { useCountUp } from '@/composables/useCountUp'
import { useSound } from '@/composables/useSound'

/**
 * ¡Examen perfecto! en dos tiempos:
 *  1. Entrada (fondo oscuro): una franja diagonal cruza la pantalla y Mocca entra volando, asombrada,
 *     con ojos blancos enormes y la boca abierta; "¡Examen perfecto!" y cuadritos de confetti.
 *  2. Resumen: Mocca sacando músculo con medalla de oro, tres tarjetas (XP, 100 %, tiempo) y "Recibir XP".
 */
const props = defineProps<{ open: boolean; xp: number; streak: number; timeSec: number; limitSec: number; bones?: number }>()
const emit = defineEmits<{ close: [] }>()

const sound = useSound()
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const stage = ref<'intro' | 'summary'>('intro')
const xpCount = useCountUp()
const timers: number[] = []
const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
const clearTimers = () => timers.splice(0).forEach(clearTimeout)

function start() {
  clearTimers()
  if (reduced) return showSummary()
  stage.value = 'intro'
  sound.play('perfect')
  // cuadritos de confetti justo cuando Mocca "aterriza" con el golpe grave del sonido
  later(460, () =>
    confetti({
      particleCount: 60,
      spread: 130,
      startVelocity: 38,
      gravity: 0.7,
      ticks: 160,
      origin: { y: 0.42 },
      shapes: ['square'],
      colors: ['#ffffff', '#dceaff', '#7fb4ff', '#ab90f7'],
      scalar: 0.9,
    }),
  )
  later(2300, showSummary)
}

function showSummary() {
  if (stage.value === 'summary' && timers.length === 0) return
  clearTimers()
  stage.value = 'summary'
  ;[0, 1, 2].forEach((i) => later(420 + i * 160, () => sound.play('pop')))
  xpCount.run(props.xp, 900, 450)
}

watch(
  () => props.open,
  (open) => open && start(),
  { immediate: true },
)
onBeforeUnmount(() => {
  clearTimers()
  confetti.reset()
})

/** Tocar durante la entrada la salta */
function skip() {
  if (stage.value === 'intro') showSummary()
}

const PHRASES = ['¡Mocca está orgullosa de ti!', 'Ni un solo error. ¡Eres una crack!', '¡Ese parcial no sabe lo que le espera!', '¡Doctora en potencia!']
const phrase = computed(() => PHRASES[props.xp % PHRASES.length])
const fast = computed(() => props.timeSec <= props.limitSec * 0.5)

const cards = computed(() => [
  { label: 'XP GANADA', icon: PhLightning, value: `${Math.round(xpCount.value.value)}`, color: '#ffcf3f', deep: '#d99a00' },
  { label: 'SIN ERRORES', icon: PhTarget, value: '100%', color: '#59d394', deep: '#1f9e5c' },
  { label: fast.value ? 'VELOZ' : 'A TIEMPO', icon: PhTimer, value: clock(props.timeSec), color: '#7fb4ff', deep: '#2f73d6' },
])
</script>

<template>
  <AnimatePresence>
    <div v-if="open" class="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="¡Examen perfecto!">
      <AnimatePresence mode="wait">
        <!-- ── 1. Entrada ── -->
        <motion.div
          v-if="stage === 'intro'"
          key="intro"
          class="absolute inset-0 overflow-hidden bg-[#16141c]"
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :exit="{ opacity: 0 }"
          :transition="{ duration: 0.2 }"
          @click="skip"
        >
          <!-- franja diagonal con líneas de velocidad -->
          <motion.div
            class="vq-band absolute -left-[30%] top-[14%] h-[46%] w-[160%] -rotate-[12deg]"
            :initial="{ scaleX: 0 }"
            :animate="{ scaleX: 1 }"
            :transition="{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }"
            style="transform-origin: left center"
          >
            <span v-for="i in 5" :key="i" class="vq-speed" :style="{ top: `${12 + i * 15}%`, animationDelay: `${i * 0.13}s` }" />
          </motion.div>

          <!-- Mocca entra volando y tiembla de la emoción -->
          <motion.div
            class="absolute left-1/2 top-[17%] -ml-[135px]"
            :initial="{ x: -420, y: 120, rotate: -28, scale: 0.45 }"
            :animate="{ x: 0, y: 0, rotate: -7, scale: 1 }"
            :transition="{ type: 'spring', stiffness: 230, damping: 15, delay: 0.12 }"
          >
            <MascotBlob mood="amazed" :size="270" />
          </motion.div>

          <motion.h1
            class="absolute inset-x-0 top-[66%] px-6 text-center font-display-tight text-[58px] font-extrabold leading-[0.95] tracking-[-0.035em] text-[#9fceff]"
            :initial="{ opacity: 0, y: 40, scale: 0.9 }"
            :animate="{ opacity: 1, y: 0, scale: 1 }"
            :transition="{ ...spring.jelly, delay: 0.55 }"
          >
            ¡Examen<br />perfecto!
          </motion.h1>
        </motion.div>

        <!-- ── 2. Resumen ── -->
        <motion.div
          v-else
          key="summary"
          class="absolute inset-0 flex flex-col items-center overflow-y-auto bg-bg px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[8dvh] text-center"
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :transition="{ duration: 0.25 }"
        >
          <motion.div :initial="{ scale: 0.5, y: 40 }" :animate="{ scale: 1, y: 0 }" :transition="spring.jelly">
            <MascotBlob mood="proud" :size="220" />
          </motion.div>

          <motion.h1
            class="mt-4 font-display-tight text-[38px] font-extrabold leading-none tracking-[-0.03em] text-[#e8a800] dark:text-yellow"
            :initial="{ opacity: 0, y: 16 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{ ...spring.card, delay: 0.15 }"
          >
            ¡Examen perfecto!
          </motion.h1>
          <motion.p
            class="mt-2 text-[17px] font-semibold text-ink-2"
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :transition="{ delay: 0.3 }"
          >
            {{ phrase }}
          </motion.p>

          <!-- tarjetas con encabezado de color -->
          <div class="mt-8 grid w-full max-w-[400px] grid-cols-3 gap-3">
            <motion.div
              v-for="(c, i) in cards"
              :key="c.label"
              class="overflow-hidden rounded-[18px] border-[3px]"
              :style="{ borderColor: c.color, background: c.color }"
              :initial="{ opacity: 0, scale: 0.4, y: 20 }"
              :animate="{ opacity: 1, scale: 1, y: 0 }"
              :transition="{ ...spring.jelly, delay: 0.42 + i * 0.16 }"
            >
              <p class="py-1 font-display text-[11px] font-extrabold tracking-[0.04em] text-white">{{ c.label }}</p>
              <p
                class="flex items-center justify-center gap-1.5 rounded-[14px] bg-surface py-4 font-display text-[20px] font-extrabold tabular-nums"
                :style="{ color: c.deep }"
              >
                <component :is="c.icon" :size="20" weight="fill" />
                {{ c.value }}
              </p>
            </motion.div>
          </div>

          <p v-if="bones" class="mt-5 flex items-center gap-1.5 rounded-full bg-yellow-tint px-4 py-2 text-[14px] font-bold">
            <StickerIcon name="bone" :size="22" :tilt="-18" /> +{{ bones }} huesitos para premios
          </p>
          <p class="mt-3 flex items-center gap-1.5 text-[14px] font-semibold text-ink-2">
            <StickerIcon name="flame" :size="22" />
            Racha de {{ streak }} {{ streak === 1 ? 'día' : 'días' }}
          </p>

          <div class="mt-auto w-full max-w-[400px] pt-8">
            <motion.button
              type="button"
              class="vq-3d h-[60px] w-full rounded-[18px] bg-lilac font-display text-[18px] font-extrabold tracking-[0.03em] text-white"
              :initial="{ opacity: 0, y: 24 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="{ ...spring.card, delay: 0.95 }"
              @click="emit('close')"
            >
              RECIBIR XP
            </motion.button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  </AnimatePresence>
</template>

<style scoped>
.vq-band {
  background: #7fb4ff;
  box-shadow:
    0 0 0 10px #bcdaff,
    0 0 0 18px rgba(188, 218, 255, 0.35);
  overflow: hidden;
}
/* líneas blancas que pasan rápido: sensación de vuelo */
.vq-speed {
  position: absolute;
  left: -30%;
  height: 7px;
  width: 30%;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
  animation: speed 0.7s linear infinite;
}
@keyframes speed {
  to { transform: translateX(480%); }
}
/* botón "3D": borde inferior oscuro que se hunde al tocar */
.vq-3d {
  box-shadow: 0 6px 0 #7a5bd6;
  transition: transform 0.08s, box-shadow 0.08s;
}
.vq-3d:active {
  transform: translateY(5px);
  box-shadow: 0 1px 0 #7a5bd6;
}
</style>
