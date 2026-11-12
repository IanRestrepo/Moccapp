<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import confetti from 'canvas-confetti'
import { PhLightning, PhTarget, PhTimer } from '@phosphor-icons/vue'
import MascotBlob, { type MascotAct, type MascotMood } from '@/components/mascot/MascotBlob.vue'
import StickerIcon from '@/components/StickerIcon.vue'
import { clock } from '@/lib/format'
import { spring } from '@/lib/motion'
import { useCountUp } from '@/composables/useCountUp'
import { useSound } from '@/composables/useSound'
import { api } from '@/api/client'

/**
 * ¡Examen perfecto! en dos tiempos:
 *  1. Entrada (fondo oscuro), una escena corta con Mocca de protagonista:
 *     0,0 s  llega corriendo desde la izquierda (inclinada, orejas hacia atrás, patas revueltas)
 *     0,7 s  frena, se resbala y se va de espaldas hasta salirse por la derecha… ¡pum! (1,6 s)
 *     1,95 s vuelve caminando, medio apenada
 *     2,8 s  ve el resultado y se agacha para tomar impulso
 *     3,05 s EXPLOSIÓN: destello, ondas de choque, rayos girando; le brillan los ojos y salta de emoción
 *            (se estira al subir y se aplasta al caer); "¡Examen perfecto!" cae letra por letra en dorado.
 *            Se queda celebrando hasta que toque la pantalla.
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
/** Segundo en que estalla todo (lo demás se mide desde aquí) */
const BOOM = 3.05
const act = ref<MascotAct | undefined>('run')
const mood = ref<MascotMood>('happy')
/** fase de la escena, para el polvo del frenazo y el golpe */
const beat = ref<'run' | 'slip' | 'crash' | 'back' | 'boom'>('run')

/**
 * La música de la escena la entrega el servidor (no viene con la app). Es una canción larga: se pide su dirección
 * al entrar a resultados, pero solo se empieza a cargar si de verdad sale la escena. La escena espera a que pueda
 * sonar para que la explosión caiga justo donde entra la banda. Si no hay música, suena el efecto de siempre.
 */
const go = ref(false)
let hasMusic = false
const music = api
  .sceneMusic()
  .then((url) => {
    if (!url) return
    sound.setSource('perfectScene', url)
    hasMusic = true
  })
  .catch(() => {})

async function start() {
  clearTimers()
  if (reduced) return showSummary()
  go.value = false
  stage.value = 'intro'
  // máximo 2 s de espera: si la red está lenta, la escena sale igual
  await Promise.race([music.then(() => (hasMusic ? sound.ready('perfectScene') : undefined)), new Promise((r) => setTimeout(r, 2000))])
  if (!props.open || stage.value !== 'intro') return
  go.value = true
  if (hasMusic) sound.play('perfectScene')
  // sin música guardada: el efecto de siempre, con su golpe grave justo en la explosión
  else later(BOOM * 1000 - 460, () => sound.play('perfect'))
  act.value = 'run'
  mood.value = 'happy'
  beat.value = 'run'
  // frena y se resbala
  later(700, () => {
    act.value = 'slip'
    mood.value = 'surprised'
    beat.value = 'slip'
  })
  // ¡pum! contra el borde
  later(1600, () => {
    beat.value = 'crash'
    confetti({ particleCount: 16, angle: 180, spread: 70, startVelocity: 30, gravity: 0.9, ticks: 70, origin: { x: 1, y: 0.44 }, shapes: ['star'], colors: ['#ffffff', '#ffcf3f'], scalar: 1.1 })
  })
  // vuelve caminando
  later(1950, () => {
    act.value = 'waddle'
    mood.value = 'surprised'
    beat.value = 'back'
  })
  later(BOOM * 1000 - 260, () => {
    act.value = 'crouch'
    mood.value = 'surprised'
  })
  later(BOOM * 1000, () => {
    act.value = 'jump'
    mood.value = 'amazed'
    beat.value = 'boom'
    confetti({ particleCount: 90, spread: 360, startVelocity: 46, gravity: 0.55, ticks: 190, origin: { x: 0.5, y: 0.4 }, shapes: ['star'], colors: GOLD, scalar: 1.25 })
    confetti({ particleCount: 50, spread: 360, startVelocity: 26, gravity: 0.4, ticks: 150, origin: { x: 0.5, y: 0.4 }, shapes: ['circle'], colors: ['#ab90f7', '#7fb4ff', '#ff86c3'], scalar: 0.7 })
  })
  // cañones a los lados cuando cae el título
  later(BOOM * 1000 + 900, () => {
    confetti({ particleCount: 45, angle: 60, spread: 60, startVelocity: 52, origin: { x: 0, y: 0.78 }, colors: GOLD })
    confetti({ particleCount: 45, angle: 120, spread: 60, startVelocity: 52, origin: { x: 1, y: 0.78 }, colors: GOLD })
  })
  // no pasa sola al resumen: Mocca se queda celebrando hasta que toque la pantalla
}

function showSummary() {
  if (stage.value === 'summary' && timers.length === 0) return
  clearTimers()
  // la canción sigue mientras Mocca celebra y se apaga suave cuando toca la pantalla
  sound.stop('perfectScene', 700)
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
  sound.stop('perfectScene')
  confetti.reset()
})

/** Tocar la pantalla pasa al resumen (en cualquier momento de la escena) */
function skip() {
  if (stage.value === 'intro') showSummary()
}

/** Letras del título, cada una con su retraso (caen una por una) */
const TITLE = ['¡Examen', 'perfecto!'].map((word, w) => [...word].map((ch, i) => ({ ch, delay: BOOM + 0.35 + (w * 7 + i) * 0.045 })))
/** Chispas fijas alrededor de Mocca (posición, tamaño y retraso) */
const SPARKS = [
  [12, 16, 14, 0], [84, 12, 10, 0.3], [6, 40, 9, 0.7], [92, 36, 15, 0.15], [18, 58, 11, 0.5], [80, 60, 9, 0.9],
  [30, 8, 8, 1.1], [68, 6, 12, 0.6], [4, 24, 7, 1.3], [95, 52, 8, 0.4],
].map(([x, y, size, delay]) => ({ x: x!, y: y!, size: size!, delay: delay! }))

/** Lirios de la montañita: posición (% del ancho), qué tan abajo de la cima (px), tamaño y retraso del vaivén */
const LILIES = [
  { x: 6, y: 34, s: 62, d: 0, pink: false },
  { x: 17, y: 58, s: 44, d: 0.6, pink: true },
  { x: 29, y: 96, s: 54, d: 1.1, pink: false },
  { x: 73, y: 92, s: 50, d: 0.3, pink: true },
  { x: 84, y: 52, s: 46, d: 0.9, pink: false },
  { x: 94, y: 30, s: 64, d: 1.4, pink: true },
  { x: 2, y: 150, s: 84, d: 0.4, pink: true },
  { x: 91, y: 160, s: 90, d: 1, pink: false },
  { x: 45, y: 20, s: 30, d: 0.7, pink: false },
  { x: 60, y: 24, s: 28, d: 1.2, pink: true },
]

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
          v-if="stage === 'intro' && go"
          key="intro"
          class="pc-intro absolute inset-0 overflow-hidden"
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :exit="{ opacity: 0 }"
          :transition="{ duration: 0.2 }"
          @click="skip"
        >
          <div class="pc-stage absolute inset-0" :style="{ '--boom': `${BOOM}s` }">
            <!-- cielo de atardecer: estrellitas, sol escondiéndose y nubes -->
            <span v-for="i in 14" :key="`st${i}`" class="pc-star" :style="{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 30}%`, animationDelay: `${(i % 5) * 0.4}s` }" />
            <div class="pc-sun" />
            <svg class="pc-cloud" style="left: -6%; top: 13%; width: 46%" viewBox="0 0 200 70"><path d="M20 60a20 20 0 0 1 6-39 30 30 0 0 1 56-8 24 24 0 0 1 42 8 20 20 0 0 1 50 14 14 14 0 0 1 4 25z" fill="#fff" opacity="0.220" /></svg>
            <svg class="pc-cloud pc-cloud--b" style="right: -10%; top: 22%; width: 40%" viewBox="0 0 200 70"><path d="M20 60a20 20 0 0 1 6-39 30 30 0 0 1 56-8 24 24 0 0 1 42 8 20 20 0 0 1 50 14 14 14 0 0 1 4 25z" fill="#fff" opacity="0.160" /></svg>

            <!-- rayos girando detrás (aparecen con la explosión) -->
            <div class="pc-rays" />
            <div class="pc-aura" />

            <!-- montañas del fondo -->
            <svg class="pc-hills pc-hills--far" viewBox="0 0 400 500" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 96C50 40 96 26 150 70c30-44 86-70 132-22 40-30 84-18 118 26v426H0z" fill="#6d4fa3" />
              <path d="M0 132c60-46 120-40 176 2 54-44 150-52 224 6v360H0z" fill="#4d7c8a" />
            </svg>
            <!-- la montañita donde corre Mocca -->
            <svg class="pc-hills pc-hills--near" viewBox="0 0 400 500" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 78C110 24 290 24 400 78v422H0z" fill="#2f8f63" />
              <path d="M0 78C110 24 290 24 400 78v14C290 40 110 40 0 92z" fill="#5fc98a" opacity="0.850" />
              <path d="M0 190c120-36 280-36 400 0v310H0z" fill="#1f6b4c" />
              <path d="M0 330c130-30 270-30 400 0v170H0z" fill="#17543c" />
              <!-- pastico -->
              <g fill="none" stroke="#7fe0a3" stroke-width="2.500" stroke-linecap="round" opacity="0.700">
                <path d="M40 70l-3-12M46 68l2-13M52 67l6-10M120 44l-3-12M126 43l2-13M300 46l-4-12M306 47l3-12M356 66l-3-12M362 68l4-11M200 37l-2-11M206 37l3-11" />
              </g>
            </svg>
            <!-- lirios meciéndose -->
            <svg
              v-for="(l, i) in LILIES"
              :key="`l${i}`"
              class="pc-lily"
              viewBox="0 0 60 96"
              :style="{ left: `${l.x}%`, top: `calc(40% + ${62 + l.y}px)`, width: `${l.s}px`, marginLeft: `${-l.s / 2}px`, marginTop: `${-l.s * 1.6}px`, animationDelay: `${l.d}s` }"
              aria-hidden="true"
            >
              <path d="M30 96C31 76 29 60 30 40" fill="none" stroke="#1d7a4c" stroke-width="3.500" stroke-linecap="round" />
              <path d="M30 78C20 74 12 64 12 52c10 4 17 12 18 26zM30 68c9-3 16-12 17-23-9 3-16 11-17 23z" fill="#2ea864" stroke="#145c39" stroke-width="2" stroke-linejoin="round" />
              <g :fill="l.pink ? '#ffd3e6' : '#ffffff'" :stroke="l.pink ? '#d9649a' : '#c9b6e8'" stroke-width="2" stroke-linejoin="round">
                <path d="M30 40C18 34 8 22 6 8c12 4 20 14 24 32z" />
                <path d="M30 40c12-6 22-18 24-32-12 4-20 14-24 32z" />
                <path d="M30 40C22 28 22 12 30 2c8 10 8 26 0 38z" />
                <path d="M30 40C16 42 6 36 2 26c12-2 22 4 28 14zM30 40c14 2 24-4 28-14-12-2-22 4-28 14z" />
              </g>
              <path d="M30 38l-5-16M30 38l5-16M30 38V18" fill="none" stroke="#f2b31f" stroke-width="2" stroke-linecap="round" />
              <g fill="#ff9b45"><circle cx="25" cy="21" r="2.200" /><circle cx="35" cy="21" r="2.200" /><circle cx="30" cy="17" r="2.200" /></g>
            </svg>

            <!-- líneas de velocidad mientras llega corriendo -->
            <span v-for="i in 4" :key="`v${i}`" class="pc-speed" :style="{ top: `${30 + i * 5}%`, animationDelay: `${i * 0.09}s` }" />

            <!-- justo antes de estallar: la energía se junta -->
            <span v-for="i in 3" :key="`c${i}`" class="pc-charge-ring" :style="{ animationDelay: `${BOOM - 0.45 + (i - 1) * 0.1}s` }" />

            <!-- explosión -->
            <span v-for="i in 3" :key="`w${i}`" class="pc-wave" :style="{ animationDelay: `${BOOM + (i - 1) * 0.11}s` }" />
            <span v-for="i in 12" :key="`s${i}`" class="pc-streak" :style="{ '--a': `${i * 30}deg` }" />

            <!-- chispas -->
            <svg
              v-for="(k, i) in SPARKS"
              :key="`k${i}`"
              class="pc-spark"
              viewBox="0 0 24 24"
              :style="{ left: `${k.x}%`, top: `${k.y}%`, width: `${k.size * 2}px`, animationDelay: `${BOOM + 0.25 + k.delay}s` }"
            >
              <path d="M12 0c1.200 7.600 3.400 9.800 12 12-8.600 2.200-10.800 4.400-12 12-1.200-7.600-3.400-9.800-12-12 8.600-2.200 10.800-4.400 12-12z" fill="currentColor" />
            </svg>

            <!-- polvo del frenazo -->
            <template v-if="beat === 'slip' || beat === 'crash'">
              <span v-for="i in 6" :key="`d${i}`" class="pc-dust" :style="{ '--dx': `${-18 - i * 16}px`, '--dy': `${-6 - (i % 3) * 12}px`, animationDelay: `${i * 0.05}s` }" />
            </template>
            <!-- ¡pum! -->
            <p v-if="beat === 'crash'" class="pc-pum font-display">¡PUM!</p>

            <!-- Mocca: corre, se resbala, vuelve y salta -->
            <div class="pc-mocca">
              <MascotBlob :mood="mood" :act="act" :size="230" />
            </div>

            <!-- el título cae letra por letra -->
            <h1 class="pc-title font-display-tight" aria-label="¡Examen perfecto!">
              <span v-for="(word, w) in TITLE" :key="w" class="block" aria-hidden="true">
                <span v-for="(l, i) in word" :key="i" class="pc-letter" :style="{ animationDelay: `${l.delay}s` }">{{ l.ch }}</span>
              </span>
            </h1>
            <p class="pc-sub">100 % · ni un solo error</p>
            <p class="pc-hint">Toca para continuar</p>
          </div>
          <!-- destello blanco de la explosión -->
          <div class="pc-flash" :style="{ '--boom': `${BOOM}s` }" />
        </motion.div>

        <!-- ── 2. Resumen ── -->
        <motion.div
          v-else-if="stage === 'summary'"
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
  /* atardecer: morado arriba, rosa y durazno hacia el horizonte */
  background: linear-gradient(180deg, #241a52 0%, #4a2f86 22%, #a8559f 40%, #f08fa6 52%, #ffc98f 62%, #ffc98f 100%);
}
.pc-star {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #fff;
  animation: starblink 2.200s ease-in-out infinite;
}
.pc-sun {
  position: absolute;
  left: 50%;
  top: calc(40% + 10px);
  width: 210px;
  height: 210px;
  margin: -105px 0 0 -105px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff6c9 0%, #ffd77a 38%, rgba(255, 170, 100, 0.550) 62%, transparent 72%);
}
.pc-cloud {
  position: absolute;
  animation: drift 9s ease-in-out infinite alternate;
}
.pc-cloud--b {
  animation-duration: 12s;
  animation-direction: alternate-reverse;
}
.pc-hills {
  position: absolute;
  left: 0;
  width: 100%;
  bottom: 0;
}
.pc-hills--far {
  top: calc(40% - 34px);
  height: calc(60% + 34px);
}
/* la cima queda justo bajo las patas de Mocca */
.pc-hills--near {
  top: calc(40% + 62px);
  height: calc(60% - 62px);
}
.pc-lily {
  position: absolute;
  transform-origin: 50% 100%;
  animation: sway 2.600s ease-in-out infinite alternate;
  filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.180));
}
.pc-stage {
  animation:
    bump 0.350s 1.600s ease-out both,
    shake 0.500s var(--boom) cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}
/* centro de la explosión: donde aparece Mocca */
.pc-rays,
.pc-aura,
.pc-charge-ring,
.pc-wave,
.pc-streak {
  position: absolute;
  left: 50%;
  top: 40%;
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
  animation:
    rays-in 0.600s var(--boom) cubic-bezier(0.2, 0.9, 0.3, 1) forwards,
    spin 26s var(--boom) linear infinite;
}
.pc-aura {
  width: 380px;
  height: 380px;
  margin: -190px 0 0 -190px;
  background: radial-gradient(circle, rgba(255, 240, 180, 0.750) 0%, rgba(255, 207, 63, 0.350) 32%, rgba(171, 144, 247, 0.180) 55%, transparent 70%);
  opacity: 0;
  animation:
    aura-in 0.500s var(--boom) ease-out forwards,
    aura 1.100s calc(var(--boom) + 0.500s) ease-in-out infinite;
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
/* ondas de choque */
.pc-wave {
  width: 90px;
  height: 90px;
  margin: -45px 0 0 -45px;
  border: 7px solid #fff;
  opacity: 0;
  animation: wave 0.750s cubic-bezier(0.1, 0.7, 0.3, 1) forwards;
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
  animation: streak 0.550s var(--boom) cubic-bezier(0.1, 0.7, 0.3, 1) forwards;
}
.pc-flash {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0;
  pointer-events: none;
  animation: flash 0.550s calc(var(--boom) - 0.030s) ease-out both;
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
/* Mocca recorre la pantalla: entra corriendo, se pasa de largo resbalando, y vuelve al centro */
.pc-mocca {
  position: absolute;
  left: 50%;
  top: 40%;
  width: 230px;
  margin: -150px 0 0 -115px;
  animation: travel 2.800s linear both;
}
/* líneas de velocidad */
.pc-speed {
  position: absolute;
  left: 0;
  height: 5px;
  width: 26%;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.450);
  opacity: 0;
  animation: speed 0.380s linear 2;
}
/* polvo del frenazo */
.pc-dust {
  position: absolute;
  left: 50%;
  top: calc(40% + 92px);
  width: 30px;
  height: 30px;
  margin-left: -15px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.800);
  opacity: 0;
  animation: dust 0.650s ease-out both;
}
.pc-pum {
  position: absolute;
  right: 10px;
  top: 30%;
  font-size: 34px;
  font-weight: 800;
  color: #fff;
  rotate: 12deg;
  text-shadow:
    0 3px 0 #ff5d8f,
    0 0 16px rgba(255, 93, 143, 0.800);
  animation: pum 0.400s cubic-bezier(0.2, 1.6, 0.4, 1) both;
}
.pc-title {
  position: absolute;
  inset-inline: 0;
  top: 64%;
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
  animation:
    slam 0.420s cubic-bezier(0.2, 1.4, 0.4, 1) both,
    shine 2.400s calc(var(--boom) + 1.600s) ease-in-out infinite;
}
.pc-sub {
  position: absolute;
  inset-inline: 0;
  top: calc(64% + clamp(100px, 29vw, 132px));
  text-align: center;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.080em;
  text-transform: uppercase;
  color: #fff6cf;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.350);
  opacity: 0;
  animation: rise 0.450s calc(var(--boom) + 1.300s) ease-out both;
}
.pc-hint {
  position: absolute;
  inset-inline: 0;
  bottom: max(22px, env(safe-area-inset-bottom));
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.850);
  font-size: 14px;
  opacity: 0;
  /* aparece y luego late suave: es la única forma de seguir */
  animation:
    rise 0.400s calc(var(--boom) + 2.200s) ease-out both,
    hint 1.800s calc(var(--boom) + 2.800s) ease-in-out infinite;
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
@keyframes starblink {
  50% { opacity: 0.250; transform: scale(0.600); }
}
@keyframes drift {
  to { transform: translateX(26px); }
}
@keyframes sway {
  from { transform: rotate(-7deg) skewX(3deg); }
  to { transform: rotate(7deg) skewX(-3deg); }
}
@keyframes bump {
  20% { transform: translate(10px, 0) rotate(0.600deg); }
  45% { transform: translate(-6px, 2px); }
  70% { transform: translate(3px, 0); }
  100% { transform: none; }
}
@keyframes travel {
  0% { transform: translateX(-82vw); animation-timing-function: linear; }
  25% { transform: translateX(-4vw); animation-timing-function: cubic-bezier(0.3, 0.3, 0.6, 1); }
  57.100% { transform: translateX(98vw); animation-timing-function: linear; }
  69.600% { transform: translateX(98vw); animation-timing-function: cubic-bezier(0.4, 0, 0.5, 1); }
  100% { transform: translateX(0); }
}
@keyframes speed {
  0% { opacity: 0; transform: translateX(110vw); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translateX(-40vw); }
}
@keyframes dust {
  0% { opacity: 0.900; transform: translate(0, 0) scale(0.300); }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1.700); }
}
@keyframes pum {
  0% { opacity: 0; scale: 0.200; }
  100% { opacity: 1; scale: 1; }
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
@keyframes slam {
  0% { opacity: 0; transform: translateY(-46px) scale(3.200) rotate(-12deg); }
  60% { opacity: 1; transform: translateY(4px) scale(0.880) rotate(2deg); }
  100% { opacity: 1; transform: none; }
}
@keyframes shine {
  0%, 100% { filter: drop-shadow(0 4px 0 #9a5200) drop-shadow(0 0 14px rgba(255, 190, 40, 0.550)); }
  50% { filter: drop-shadow(0 4px 0 #9a5200) drop-shadow(0 0 26px rgba(255, 225, 120, 0.950)) brightness(1.150); }
}
@keyframes hint {
  50% { opacity: 0.350; }
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
