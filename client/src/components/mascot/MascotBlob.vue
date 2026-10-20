<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { motion, useReducedMotion } from 'motion-v'
import { spring } from '@/lib/motion'

/**
 * Mocca: la mascota de VetQuiz, basada en la perrita de la casa. Orejas grandes y paradas,
 * pelaje chocolate oscuro, cejitas y cachetes caramelo, pecho blanco, patitas caramelo y collar morado con una placa con la M de Mocca.
 * Estilo sticker: relleno plano, contorno negro y borde blanco troquelado.
 * happy (inicio) · thinking (generando) · surprised (poco tiempo) · celebrating (nota ≥ 3.0) · sad (nota baja)
 * amazed (examen perfecto, entrada): ojos blancos enormes, boca abierta hacia abajo, brazos abiertos
 * proud (examen perfecto, resumen): sacando músculo con medalla de oro
 */
export type MascotMood = 'happy' | 'thinking' | 'surprised' | 'celebrating' | 'sad' | 'amazed' | 'proud'

const props = withDefaults(defineProps<{ mood?: MascotMood; size?: number; label?: string }>(), {
  mood: 'happy',
  size: 160,
})

const reduced = useReducedMotion()

const INK = '#16141C'
const COAT = '#4E3830' // chocolate oscuro
const COAT_HI = '#7A5A4C' // brillo del pelaje
const TAN = '#D9935A' // caramelo
const CREAM = '#F6EEE6' // pecho
const EAR_IN = '#F3A9B5'
// el lila de la paleta (mismo de la tarjeta "Nuevo examen"); el contorno negro lo separa del fondo
const COLLAR = 'var(--vq-lilac)'
const GOLD = '#FFCF3F'
const GOLD_DEEP = '#E0A400'

const squishKey = ref(0)
watch(
  () => props.mood,
  () => squishKey.value++,
)

const idle = computed(() => {
  if (reduced.value) return {}
  if (props.mood === 'celebrating') return { y: [0, -12, 0] }
  if (props.mood === 'thinking') return { rotate: [-3, 3, -3] }
  // tiembla de la emoción
  if (props.mood === 'amazed') return { rotate: [-2.5, 2.5, -2.5], y: [0, -2, 0] }
  // saca músculo: se infla y vuelve
  if (props.mood === 'proud') return { scaleX: [1, 1.05, 1], scaleY: [1, 0.97, 1], y: [0, -4, 0] }
  return { scaleY: [1, 1.02, 1] }
})
const IDLE_SECS: Partial<Record<MascotMood, number>> = { celebrating: 0.6, thinking: 2.6, amazed: 0.16, proud: 0.9 }
const idleTransition = computed(() => ({ duration: IDLE_SECS[props.mood] ?? 3, repeat: Infinity, ease: 'easeInOut' as const }))

// Las orejas se mueven un poquito según el ánimo (como Mocca cuando escucha)
const earTilt = computed(() => ({ happy: 0, thinking: -6, surprised: 4, celebrating: 6, sad: -16, amazed: 14, proud: 4 })[props.mood])

const eyeY = computed(() => (props.mood === 'thinking' ? 94 : 100))
const eyeDx = computed(() => (props.mood === 'thinking' ? 5 : 0))
</script>

<template>
  <svg
    :width="size"
    :height="size * 1.05"
    viewBox="0 0 200 210"
    role="img"
    :aria-label="label ?? 'Mocca'"
    class="vq-die-cut overflow-visible"
  >
    <ellipse cx="100" cy="199" rx="56" ry="7" :fill="INK" opacity="0.12" />

    <!-- destellos -->
    <g v-if="mood === 'celebrating'" :stroke="INK" stroke-width="3.5" stroke-linejoin="round" :class="!reduced && 'vq-twinkle'">
      <path d="M14 70c1.5 9 5 12.5 14 14-9 1.5-12.5 5-14 14-1.5-9-5-12.5-14-14 9-1.5 12.5-5 14-14z" fill="var(--vq-yellow)" />
      <path d="M186 64c1 6 3.5 8.5 9.5 9.5-6 1-8.5 3.5-9.5 9.5-1-6-3.5-8.5-9.5-9.5 6-1 8.5-3.5 9.5-9.5z" fill="var(--vq-pink)" />
      <circle cx="190" cy="118" r="5" fill="var(--vq-sky)" />
    </g>
    <!-- destellos verdes alrededor de Mocca orgullosa -->
    <g v-if="mood === 'proud'" fill="var(--vq-mint)" :class="!reduced && 'vq-twinkle'">
      <path d="M22 18c1.6 9.5 5.2 13 14.5 14.5-9.3 1.5-12.9 5-14.5 14.5-1.6-9.5-5.2-13-14.5-14.5 9.3-1.5 12.9-5 14.5-14.5z" />
      <path d="M180 2c1.2 7 4 10 11 11-7 1.2-10 4-11 11-1.2-7-4-10-11-11 7-1.2 10-4 11-11z" />
      <path d="M192 140c1 6 3.4 8.4 9.4 9.4-6 1-8.4 3.4-9.4 9.4-1-6-3.4-8.4-9.4-9.4 6-1 8.4-3.4 9.4-9.4z" />
      <path d="M2 150c1 5.5 3 7.5 8.5 8.5-5.5 1-7.5 3-8.5 8.5-1-5.5-3-7.5-8.5-8.5 5.5-1 7.5-3 8.5-8.5z" />
    </g>

    <!-- burbujas de pensamiento -->
    <g v-if="mood === 'thinking'" fill="#fff" :stroke="INK" stroke-width="4" :class="!reduced && 'vq-bob'">
      <circle cx="170" cy="62" r="6" />
      <circle cx="188" cy="40" r="10" />
    </g>

    <motion.g
      :key="squishKey"
      :initial="reduced ? false : { scaleX: 1.1, scaleY: 0.9 }"
      :animate="{ scaleX: 1, scaleY: 1 }"
      :transition="spring.jelly"
      style="transform-origin: 100px 195px"
    >
      <motion.g :animate="idle" :transition="idleTransition" style="transform-origin: 100px 195px">
        <g :stroke="INK" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
          <!-- orejas grandes y paradas (detrás de la cabeza) -->
          <motion.g :animate="{ rotate: -earTilt }" :transition="spring.jelly" style="transform-origin: 72px 52px">
            <path d="M50 72C42 50 32 26 28 8c-1.5-6 3-9 8-6 20 12 42 28 58 40" :fill="COAT" />
            <path d="M50 58C45 42 40 28 37 16c14 9 28 19 40 28z" :fill="EAR_IN" stroke="none" />
          </motion.g>
          <motion.g :animate="{ rotate: earTilt }" :transition="spring.jelly" style="transform-origin: 128px 52px">
            <path d="M150 72c8-22 18-46 22-64 1.5-6-3-9-8-6-20 12-42 28-58 40" :fill="COAT" />
            <path d="M150 58c5-16 10-30 13-42-14 9-28 19-40 28z" :fill="EAR_IN" stroke="none" />
          </motion.g>

          <!-- patitas caramelo -->
          <ellipse cx="74" cy="188" rx="19" ry="10" :fill="TAN" />
          <ellipse cx="126" cy="188" rx="19" ry="10" :fill="TAN" />

          <!-- brazos (trazo negro grueso + trazo caramelo encima = brazo con contorno) -->
          <template v-if="mood === 'celebrating'">
            <path d="M40 126Q16 100 26 70" fill="none" stroke-width="20" />
            <path d="M160 126Q184 100 174 70" fill="none" stroke-width="20" />
            <path d="M40 126Q16 100 26 70" fill="none" :stroke="TAN" stroke-width="9" />
            <path d="M160 126Q184 100 174 70" fill="none" :stroke="TAN" stroke-width="9" />
          </template>
          <!-- asombrada: brazos abiertos como alas -->
          <template v-else-if="mood === 'amazed'">
            <path d="M40 122Q18 114 4 96" fill="none" stroke-width="21" />
            <path d="M160 122Q182 114 196 96" fill="none" stroke-width="21" />
            <path d="M40 122Q18 114 4 96" fill="none" :stroke="TAN" stroke-width="10" />
            <path d="M160 122Q182 114 196 96" fill="none" :stroke="TAN" stroke-width="10" />
          </template>
          <!-- orgullosa: los brazos van adelante del cuerpo (más abajo) -->
          <template v-else-if="mood === 'proud'" />
          <template v-else>
            <path d="M36 138Q24 152 32 166" fill="none" stroke-width="19" />
            <path d="M164 138Q176 152 168 166" fill="none" stroke-width="19" />
            <path d="M36 138Q24 152 32 166" fill="none" :stroke="TAN" stroke-width="8" />
            <path d="M164 138Q176 152 168 166" fill="none" :stroke="TAN" stroke-width="8" />
          </template>

          <!-- cuerpo -->
          <path d="M100 34c50 0 76 36 74 84-2 44-32 68-74 68s-72-24-74-68c-2-48 24-84 74-84z" :fill="COAT" />

          <!-- orgullosa: sacando bíceps, por delante del cuerpo -->
          <template v-if="mood === 'proud'">
            <path d="M46 146Q6 150 12 108" fill="none" stroke-width="22" />
            <path d="M154 146Q194 150 188 108" fill="none" stroke-width="22" />
            <path d="M46 146Q6 150 12 108" fill="none" :stroke="TAN" stroke-width="11" />
            <path d="M154 146Q194 150 188 108" fill="none" :stroke="TAN" stroke-width="11" />
            <circle cx="19" cy="133" r="9.5" :fill="TAN" stroke-width="4.5" />
            <circle cx="181" cy="133" r="9.5" :fill="TAN" stroke-width="4.5" />
            <circle cx="12" cy="101" r="11" :fill="TAN" stroke-width="5" />
            <circle cx="188" cy="101" r="11" :fill="TAN" stroke-width="5" />
          </template>
        </g>

        <!-- pecho blanco -->
        <path d="M70 160c8-10 18-14 30-14s22 4 30 14c-4 14-16 22-30 22s-26-8-30-22z" :fill="CREAM" />

        <!-- brillo del pelaje -->
        <path d="M54 96q2-18 16-30" fill="none" :stroke="COAT_HI" stroke-width="7" stroke-linecap="round" />

        <!-- máscara caramelo: hocico y cachetes -->
        <path d="M60 124c4-12 20-14 40-14s36 2 40 14c3 12-10 26-40 26s-43-14-40-26z" :fill="TAN" />
        <!-- cejitas caramelo (asombrada: quedan escondidas detrás de los ojos gigantes) -->
        <g v-if="mood !== 'amazed'" :fill="TAN">
          <ellipse :cx="78 + eyeDx" :cy="mood === 'sad' ? 86 : mood === 'proud' ? 78 : 82" rx="7" ry="5" :transform="mood === 'sad' ? `rotate(18 ${78 + eyeDx} 86)` : mood === 'proud' ? 'rotate(-14 78 78)' : ''" />
          <ellipse
            :cx="122 + eyeDx"
            :cy="mood === 'thinking' ? 72 : mood === 'sad' ? 86 : mood === 'proud' ? 78 : 82"
            rx="7"
            ry="5"
            :transform="mood === 'sad' ? `rotate(-18 ${122 + eyeDx} 86)` : mood === 'proud' ? 'rotate(14 122 78)' : ''"
          />
        </g>

        <!-- ojos -->
        <g :fill="INK" :stroke="INK" stroke-linecap="round" stroke-linejoin="round">
          <template v-if="mood === 'celebrating'">
            <path d="M68 102q10-14 20 0" fill="none" :stroke="CREAM" stroke-width="10" />
            <path d="M112 102q10-14 20 0" fill="none" :stroke="CREAM" stroke-width="10" />
            <path d="M68 102q10-14 20 0" fill="none" stroke-width="6" />
            <path d="M112 102q10-14 20 0" fill="none" stroke-width="6" />
          </template>
          <!-- asombrada: ojos blancos enormes con pupilas chiquitas mirando al frente -->
          <template v-else-if="mood === 'amazed'">
            <ellipse cx="77" cy="94" rx="17.5" ry="20" fill="#fff" stroke-width="3.5" />
            <ellipse cx="123" cy="94" rx="17.5" ry="20" fill="#fff" stroke-width="3.5" />
            <circle cx="83" cy="96" r="3.6" stroke="none" />
            <circle cx="117" cy="96" r="3.6" stroke="none" />
          </template>
          <g v-else :class="!reduced && mood !== 'surprised' && 'vq-blink'" style="transform-box: fill-box; transform-origin: center">
            <template v-for="x in [78, 122]" :key="x">
              <ellipse
                :cx="x + eyeDx"
                :cy="eyeY"
                :rx="mood === 'surprised' ? 12 : 10.5"
                :ry="mood === 'surprised' ? 13 : 12"
                :fill="CREAM"
                stroke="none"
              />
              <ellipse
                :cx="x + eyeDx + (mood === 'thinking' ? 2 : 0)"
                :cy="eyeY + (mood === 'thinking' ? -2 : 1)"
                :rx="mood === 'surprised' ? 9 : 8.5"
                :ry="mood === 'surprised' ? 10.5 : 10"
                stroke="none"
              />
              <circle :cx="x + eyeDx + 3.5" :cy="eyeY - 3.5" r="3.6" fill="#fff" stroke="none" />
              <circle :cx="x + eyeDx - 3" :cy="eyeY + 4" r="1.6" fill="#fff" stroke="none" />
            </template>
          </g>
        </g>

        <!-- nariz -->
        <path d="M91 118c0-4 4-6 9-6s9 2 9 6-5 8-9 8-9-4-9-8z" :fill="INK" />
        <ellipse cx="97" cy="115.5" rx="3" ry="1.6" fill="#fff" opacity="0.7" />

        <!-- boca (la de asombro va más abajo, encima del collar) -->
        <g v-if="mood !== 'amazed'" :stroke="INK" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke-width="4">
          <template v-if="mood === 'proud'">
            <path d="M100 126v3" />
            <path d="M84 129q16 22 32 0z" :fill="INK" />
            <path d="M92 139q8-6 16 0q-2 6-8 6t-8-6z" :fill="EAR_IN" stroke-width="0" />
          </template>
          <template v-else-if="mood === 'happy' || mood === 'celebrating'">
            <path d="M100 126v4" />
            <path d="M88 130q12 18 24 0z" :fill="INK" />
            <path d="M94 138q6-5 12 0q-1 5-6 5t-6-5z" :fill="EAR_IN" stroke-width="0" />
          </template>
          <template v-else-if="mood === 'surprised'">
            <path d="M100 126v3" />
            <ellipse cx="100" cy="137" rx="6" ry="7" :fill="INK" stroke-width="0" />
          </template>
          <template v-else-if="mood === 'thinking'">
            <path d="M100 126v4" />
            <path d="M92 134q9 4 18-2" />
          </template>
          <template v-else>
            <path d="M100 126v5" />
            <path d="M90 138q10-8 20 0" />
          </template>
        </g>

        <!-- cachetes -->
        <ellipse cx="66" cy="132" rx="8" ry="5" :fill="EAR_IN" opacity="0.9" />
        <ellipse cx="134" cy="132" rx="8" ry="5" :fill="EAR_IN" opacity="0.9" />

        <!-- collar morado con contorno -->
        <g stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M64 150q36 30 72 0" :stroke="INK" stroke-width="9" />
          <path d="M64 150q36 30 72 0" :stroke="COLLAR" stroke-width="4" />
          <!-- orgullosa: medalla de oro con cinta -->
          <template v-if="mood === 'proud'">
            <path d="M88 160l9 16M112 160l-9 16" :stroke="INK" stroke-width="10" />
            <path d="M88 160l9 16" stroke="var(--vq-sky)" stroke-width="5" />
            <path d="M112 160l-9 16" stroke="var(--vq-pink)" stroke-width="5" />
            <circle cx="100" cy="186" r="16" :fill="GOLD" :stroke="INK" stroke-width="4.5" />
            <circle cx="100" cy="186" r="10.5" fill="none" :stroke="GOLD_DEEP" stroke-width="2.5" />
            <path d="M94 191v-10l6 7 6-7v10" :stroke="INK" stroke-width="3" />
            <path d="M110 176c.6 3 1.8 4.2 4.8 4.8-3 .6-4.2 1.8-4.8 4.8-.6-3-1.8-4.2-4.8-4.8 3-.6 4.2-1.8 4.8-4.8z" fill="#fff" stroke="none" />
          </template>
          <!-- placa con la M de Mocca -->
          <template v-else>
            <circle cx="100" cy="176" r="11" fill="var(--vq-yellow)" :stroke="INK" stroke-width="4.5" />
            <path d="M94.5 181v-10l5.5 6.5 5.5-6.5v10" :stroke="INK" stroke-width="3" />
          </template>
        </g>

        <!-- asombrada: boca muy abierta hacia abajo, con lengüita -->
        <g v-if="mood === 'amazed'" :stroke="INK" stroke-linejoin="round" stroke-width="4">
          <path d="M100 125v3" fill="none" stroke-linecap="round" />
          <path d="M91 129h18v26a9 9 0 0 1-18 0z" :fill="INK" />
          <ellipse cx="100" cy="157" rx="6" ry="4.5" :fill="EAR_IN" stroke="none" />
        </g>

        <!-- gotita -->
        <path
          v-if="mood === 'sad'"
          d="M156 92c4 8 8 12 8 17a8 8 0 0 1-16 0c0-5 4-9 8-17z"
          fill="var(--vq-sky)"
          :stroke="INK"
          stroke-width="3.5"
          stroke-linejoin="round"
        />
      </motion.g>
    </motion.g>
  </svg>
</template>

<style scoped>
/* borde blanco "troquelado" para que se lea en fondo oscuro y claro */
.vq-die-cut {
  filter: drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff);
}
.vq-blink {
  animation: blink 4.5s infinite;
}
.vq-twinkle {
  animation: twinkle 0.9s ease-in-out infinite alternate;
  transform-box: fill-box;
  transform-origin: center;
}
.vq-bob {
  animation: bob 1.8s ease-in-out infinite;
}
@keyframes blink {
  0%, 93%, 100% { transform: scaleY(1); }
  96% { transform: scaleY(0.1); }
}
@keyframes twinkle {
  from { opacity: 0.5; }
  to { opacity: 1; }
}
@keyframes bob {
  50% { transform: translateY(-4px); }
}
</style>
