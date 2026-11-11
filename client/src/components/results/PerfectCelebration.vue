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
 *  1. Entrada (fondo oscuro), coreografiada con el sonido:
 *     0,0 s  la energía se carga: anillos que se cierran sobre un punto de luz
 *     0,45 s EXPLOSIÓN: destello blanco, ondas de choque, la pantalla tiembla, estrellas de confetti
 *     0,5 s  Mocca sale de la explosión (silueta blanca que toma color), flotando con aura y rayos girando detrás;
 *            los ojos le brillan en blanco
 *     1,2 s  "¡Examen perfecto!" cae letra por letra en dorado; cañones de confetti a los lados
 *  2. Resumen: Mocca con gafas y medalla de oro, tres tarjetas (XP, 100 %, tiempo) y "Recibir XP".
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

const GOLD = ['#fff7c2', '#ffcf3f', '#ff9b45', '#ffffff']
function start() {
  clearTimers()
  if (reduced) return showSummary()
  stage.value = 'intro'
  sound.play('perfect')
  // la explosión coincide con el golpe grave del sonido
  later(450, () => {
    confetti({ particleCount: 90, spread: 360, startVelocity: 46, gravity: 0.55, ticks: 190, origin: { x: 0.5, y: 0.36 }, shapes: ['star'], colors: GOLD, scalar: 1.25 })
    confetti({ particleCount: 50, spread: 360, startVelocity: 26, gravity: 0.4, ticks: 150, origin: { x: 0.5, y: 0.36 }, shapes: ['circle'], colors: ['#ab90f7', '#7fb4ff', '#ff86c3'], scalar: 0.7 })
    sound.play('pop')
  })
  // cañones a los lados cuando cae el título
  later(1350, () => {
    confetti({ particleCount: 45, angle: 60, spread: 60, startVelocity: 52, origin: { x: 0, y: 0.78 }, colors: GOLD })
    confetti({ particleCount: 45, angle: 120, spread: 60, startVelocity: 52, origin: { x: 1, y: 0.78 }, colors: GOLD })
  })
  later(2100, () => confetti({ particleCount: 30, spread: 100, startVelocity: 30, origin: { y: 0.3 }, shapes: ['star'], colors: GOLD, scalar: 0.9 }))
  later(4200, showSummary)
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

/** Letras del título, cada una con su retraso (caen una por una) */
const TITLE = ['¡Examen', 'perfecto!'].map((word, w) => [...word].map((ch, i) => ({ ch, delay: 1.15 + (w * 7 + i) * 0.045 })))
/** Chispas fijas alrededor de Mocca (posición, tamaño y retraso) */
const SPARKS = [
  [12, 16, 14, 0], [84, 12, 10, 0.3], [6, 40, 9, 0.7], [92, 36, 15, 0.15], [18, 58, 11, 0.5], [80, 60, 9, 0.9],
  [30, 8, 8, 1.1], [68, 6, 12, 0.6], [4, 24, 7, 1.3], [95, 52, 8, 0.4],
].map(([x, y, size, delay]) => ({ x: x!, y: y!, size: size!, delay: delay! }))

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
          class="pc-intro absolute inset-0 overflow-hidden"
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :exit="{ opacity: 0 }"
          :transition="{ duration: 0.2 }"
          @click="skip"
        >
          <div class="pc-stage absolute inset-0">
            <!-- rayos girando detrás (aparecen con la explosión) -->
            <div class="pc-rays" />
            <div class="pc-aura" />

            <!-- 0,0 s: la energía se carga -->
            <span v-for="i in 3" :key="`c${i}`" class="pc-charge-ring" :style="{ animationDelay: `${(i - 1) * 0.1}s` }" />
            <span class="pc-core" />

            <!-- 0,45 s: explosión -->
            <span v-for="i in 3" :key="`w${i}`" class="pc-wave" :style="{ animationDelay: `${0.45 + (i - 1) * 0.11}s` }" />
            <span v-for="i in 12" :key="`s${i}`" class="pc-streak" :style="{ '--a': `${i * 30}deg` }" />

            <!-- chispas -->
            <svg
              v-for="(k, i) in SPARKS"
              :key="`k${i}`"
              class="pc-spark"
              viewBox="0 0 24 24"
              :style="{ left: `${k.x}%`, top: `${k.y}%`, width: `${k.size * 2}px`, animationDelay: `${0.7 + k.delay}s` }"
            >
              <path d="M12 0c1.200 7.600 3.400 9.800 12 12-8.600 2.200-10.800 4.400-12 12-1.200-7.600-3.400-9.800-12-12 8.600-2.200 10.800-4.400 12-12z" fill="currentColor" />
            </svg>

            <!-- 0,5 s: Mocca sale de la explosión -->
            <div class="pc-mocca">
              <div class="pc-float"><MascotBlob mood="amazed" :size="250" /></div>
            </div>

            <!-- 1,2 s: el título cae letra por letra -->
            <h1 class="pc-title font-display-tight" aria-label="¡Examen perfecto!">
              <span v-for="(word, w) in TITLE" :key="w" class="block" aria-hidden="true">
                <span v-for="(l, i) in word" :key="i" class="pc-letter" :style="{ animationDelay: `${l.delay}s` }">{{ l.ch }}</span>
              </span>
            </h1>
            <p class="pc-sub">100 % · ni un solo error</p>
            <p class="pc-hint">Toca para continuar</p>
          </div>
          <!-- destello blanco de la explosión -->
          <div class="pc-flash" />
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
/* ── Entrada: todo va por tiempos, alineado con el sonido ── */
.pc-intro {
  background: radial-gradient(120% 80% at 50% 36%, #2a1f52 0%, #15121d 55%, #0c0a12 100%);
}
.pc-stage {
  animation: shake 0.500s 0.450s cubic-bezier(0.36, 0.07, 0.19, 0.97) both, thud 0.300s 1.200s ease-out both;
}
/* centro de la explosión: donde aparece Mocca */
.pc-rays,
.pc-aura,
.pc-charge-ring,
.pc-core,
.pc-wave,
.pc-streak {
  position: absolute;
  left: 50%;
  top: 36%;
  border-radius: 50%;
  pointer-events: none;
}
.pc-rays {
  width: 200vmax;
  height: 200vmax;
  margin: -100vmax 0 0 -100vmax;
  background: repeating-conic-gradient(from 0deg, rgba(255, 207, 63, 0.220) 0deg 9deg, transparent 9deg 22deg);
  -webkit-mask-image: radial-gradient(circle, #000 0%, rgba(0, 0, 0, 0.550) 22%, transparent 46%);
  mask-image: radial-gradient(circle, #000 0%, rgba(0, 0, 0, 0.550) 22%, transparent 46%);
  opacity: 0;
  animation: rays-in 0.600s 0.450s cubic-bezier(0.2, 0.9, 0.3, 1) forwards, spin 26s 0.450s linear infinite;
}
.pc-aura {
  width: 380px;
  height: 380px;
  margin: -190px 0 0 -190px;
  background: radial-gradient(circle, rgba(255, 240, 180, 0.750) 0%, rgba(255, 207, 63, 0.350) 32%, rgba(171, 144, 247, 0.180) 55%, transparent 70%);
  opacity: 0;
  animation: aura-in 0.500s 0.450s ease-out forwards, aura 1.100s 0.950s ease-in-out infinite;
}
/* anillos que se cierran: la energía se junta */
.pc-charge-ring {
  width: 120vmax;
  height: 120vmax;
  margin: -60vmax 0 0 -60vmax;
  border: 3px solid rgba(255, 233, 150, 0.850);
  opacity: 0;
  animation: charge 0.420s cubic-bezier(0.5, 0, 0.9, 0.4) both;
}
.pc-core {
  width: 26px;
  height: 26px;
  margin: -13px 0 0 -13px;
  background: #fff;
  box-shadow:
    0 0 18px 8px #fff,
    0 0 50px 22px #ffd23f;
  animation: core 0.520s ease-in both;
}
/* ondas de choque */
.pc-wave {
  width: 90px;
  height: 90px;
  margin: -45px 0 0 -45px;
  border: 7px solid #fff;
  opacity: 0;
  animation: wave 0.750s cubic-bezier(0.1, 0.7, 0.3, 1) both;
}
/* rayas que salen disparadas del centro */
.pc-streak {
  width: 8px;
  height: 90px;
  margin: -45px 0 0 -4px;
  border-radius: 8px;
  background: linear-gradient(#fff, #ffd23f);
  opacity: 0;
  transform: rotate(var(--a)) translateY(-70px) scaleY(0.300);
  animation: streak 0.550s 0.450s cubic-bezier(0.1, 0.7, 0.3, 1) both;
}
.pc-flash {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0;
  pointer-events: none;
  animation: flash 0.550s 0.420s ease-out both;
}
.pc-spark {
  position: absolute;
  color: #ffe58a;
  opacity: 0;
  filter: drop-shadow(0 0 6px rgba(255, 210, 63, 0.900));
  animation: spark 1.600s ease-in-out infinite;
}
.pc-spark:nth-of-type(3n) {
  color: #fff;
}
.pc-spark:nth-of-type(4n) {
  color: #c9b6ff;
}
/* Mocca: sale del destello como silueta blanca, crece de más, aterriza y queda flotando */
.pc-mocca {
  position: absolute;
  left: 50%;
  top: 36%;
  width: 250px;
  margin: -150px 0 0 -125px;
  animation: mocca-in 0.900s 0.480s cubic-bezier(0.2, 1.2, 0.3, 1) both;
}
.pc-float {
  animation: float 2.200s 1.400s ease-in-out infinite;
}
.pc-title {
  position: absolute;
  inset-inline: 0;
  top: 63%;
  padding: 0 16px;
  text-align: center;
  font-size: clamp(46px, 14vw, 64px);
  font-weight: 800;
  line-height: 0.950;
  letter-spacing: -0.035em;
}
.pc-letter {
  display: inline-block;
  background: linear-gradient(180deg, #fffbe0 0%, #ffe066 38%, #ffb11f 72%, #ff8a3d 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 4px 0 #9a5200) drop-shadow(0 0 14px rgba(255, 190, 40, 0.550));
  opacity: 0;
  animation: slam 0.420s cubic-bezier(0.2, 1.4, 0.4, 1) both, shine 2.400s 2.200s ease-in-out infinite;
}
.pc-sub {
  position: absolute;
  inset-inline: 0;
  top: calc(63% + clamp(100px, 29vw, 132px));
  text-align: center;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.080em;
  text-transform: uppercase;
  color: #cdbcff;
  opacity: 0;
  animation: rise 0.450s 2.050s ease-out both;
}
.pc-hint {
  position: absolute;
  inset-inline: 0;
  bottom: max(22px, env(safe-area-inset-bottom));
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.450);
  opacity: 0;
  animation: rise 0.400s 2.900s ease-out both;
}

@keyframes shake {
  10% { transform: translate(-9px, 6px) rotate(-0.800deg); }
  25% { transform: translate(8px, -7px) rotate(0.700deg); }
  40% { transform: translate(-6px, -4px) rotate(-0.500deg); }
  55% { transform: translate(5px, 5px) rotate(0.400deg); }
  70% { transform: translate(-3px, 2px); }
  85% { transform: translate(2px, -1px); }
  100% { transform: none; }
}
@keyframes thud {
  30% { transform: translateY(5px); }
  100% { transform: none; }
}
@keyframes rays-in {
  from { opacity: 0; transform: scale(0.200); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes spin {
  to { rotate: 360deg; }
}
@keyframes aura-in {
  from { opacity: 0; transform: scale(0.300); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes aura {
  50% { transform: scale(1.120); opacity: 0.800; }
}
@keyframes charge {
  0% { opacity: 0; transform: scale(1); }
  30% { opacity: 0.900; }
  100% { opacity: 0; transform: scale(0.010); }
}
@keyframes core {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(0.700); opacity: 1; }
  85% { transform: scale(1.600); opacity: 1; }
  100% { transform: scale(26); opacity: 0; }
}
@keyframes wave {
  0% { opacity: 1; transform: scale(0.200); border-width: 10px; }
  100% { opacity: 0; transform: scale(11); border-width: 1px; }
}
@keyframes streak {
  0% { opacity: 1; transform: rotate(var(--a)) translateY(-40px) scaleY(0.300); }
  100% { opacity: 0; transform: rotate(var(--a)) translateY(-56vmax) scaleY(1.600); }
}
@keyframes flash {
  0% { opacity: 0; }
  12% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes spark {
  0%, 100% { opacity: 0; transform: scale(0.300) rotate(0); }
  50% { opacity: 1; transform: scale(1) rotate(45deg); }
}
@keyframes mocca-in {
  0% { opacity: 0; transform: scale(0) rotate(-200deg); filter: brightness(0) invert(1); }
  35% { opacity: 1; transform: scale(1.380) rotate(10deg); filter: brightness(0) invert(1); }
  60% { transform: scale(0.920, 1.060) rotate(-4deg); filter: brightness(0.600) invert(0.400); }
  80% { transform: scale(1.050, 0.960) rotate(1deg); filter: brightness(1) invert(0); }
  100% { opacity: 1; transform: scale(1) rotate(0); filter: brightness(1) invert(0); }
}
@keyframes float {
  50% { transform: translateY(-12px) rotate(-2deg); }
}
@keyframes slam {
  0% { opacity: 0; transform: translateY(-46px) scale(3.200) rotate(-12deg); }
  60% { opacity: 1; transform: translateY(4px) scale(0.880) rotate(2deg); }
  100% { opacity: 1; transform: none; }
}
@keyframes shine {
  0%, 100% { filter: drop-shadow(0 4px 0 #9a5200) drop-shadow(0 0 14px rgba(255, 190, 40, 0.550)); }
  50% { filter: drop-shadow(0 4px 0 #9a5200) drop-shadow(0 0 26px rgba(255, 225, 120, 0.950)) brightness(1.150); }
}
@keyframes rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
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
