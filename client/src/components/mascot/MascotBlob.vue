<script setup lang="ts">
import { computed } from 'vue'

/**
 * Mocca, redibujada: cabeza y cuerpo separados, mechones de pelo en cachetes y pecho, bracitos, patas con deditos
 * y cola. Contorno café oscuro grueso, colores planos con sombras suaves (estilo ilustración de sticker).
 * Conserva lo suyo: orejas grandes y paradas, cejitas y hocico caramelo, pecho crema, collar lila con la placa de la M.
 * Cada parte se anima por separado: respira, parpadea, mueve las orejas y la cola, y cada ánimo tiene su pose.
 */
/**
 * happy (inicio) · thinking (generando) · surprised (poco tiempo) · celebrating (nota ≥ 3.0) · sad (nota baja)
 * amazed (examen perfecto, entrada: ojos blancos que brillan, pose de poder) · proud (examen perfecto, resumen: gafas de sol y medalla de oro)
 */
export type MascotMood = 'happy' | 'thinking' | 'surprised' | 'celebrating' | 'sad' | 'amazed' | 'proud'

const props = withDefaults(defineProps<{ mood?: MascotMood; size?: number; label?: string }>(), { mood: 'happy', size: 160 })

const LINE = '#2A1810' // contorno café oscuro
const COAT = '#5A4036' // chocolate
const COAT_DARK = '#46302A' // sombra del pelaje
const COAT_HI = '#7B5C4D' // brillo / mechones
const TAN = '#DFA066' // caramelo
const TAN_DARK = '#C4844E'
const CREAM = '#F8EFE4'
const EAR_IN = '#F4A8B4'
const BLUSH = '#F28FA0'
const GOLD = '#FFCF3F'
const GOLD_DEEP = '#E0A400'

const m = computed(() => props.mood)
/** brazos: grados de giro desde "abajo" (izq., der.) según la pose */
const arms = computed<[number, number]>(
  () =>
    (
      {
        happy: [8, -8],
        thinking: [6, 128],
        surprised: [52, -52],
        celebrating: [128, -128],
        sad: [2, -2],
        amazed: [138, -138],
        proud: [34, -34],
      } as Record<MascotMood, [number, number]>
    )[m.value],
)
</script>

<template>
  <svg :width="size" :height="size * 1.08" viewBox="0 0 240 260" role="img" :aria-label="label ?? 'Mocca'" :class="['mocca overflow-visible', `mocca--${mood}`]">
    <ellipse cx="120" cy="248" rx="62" ry="8" :fill="LINE" opacity="0.14" class="mocca-shadow" />

    <!-- destellos de fiesta / orgullo -->
    <g v-if="mood === 'celebrating' || mood === 'proud'" class="mocca-sparkles" :stroke="LINE" stroke-width="3" stroke-linejoin="round">
      <path d="M22 84c1.6 9 5.2 12.6 14 14-8.8 1.6-12.4 5-14 14-1.6-9-5.2-12.4-14-14 8.8-1.4 12.4-5 14-14z" :fill="mood === 'proud' ? 'var(--vq-mint)' : 'var(--vq-yellow)'" />
      <path d="M218 60c1.2 7 4 9.800 11 11-7 1.200-9.800 4-11 11-1.200-7-4-9.800-11-11 7-1.200 9.800-4 11-11z" :fill="mood === 'proud' ? 'var(--vq-yellow)' : 'var(--vq-pink)'" />
      <circle cx="226" cy="132" r="5.5" fill="var(--vq-sky)" />
      <circle cx="12" cy="150" r="4.500" fill="var(--vq-lilac)" />
    </g>
    <!-- burbujas de pensamiento -->
    <g v-if="mood === 'thinking'" class="mocca-bubbles" fill="#fff" :stroke="LINE" stroke-width="3.500">
      <circle cx="204" cy="66" r="6" />
      <circle cx="222" cy="42" r="10" />
    </g>

    <g class="mocca-all">
      <!-- cola -->
      <g class="mocca-tail">
        <path
          d="M160 214c18 2 36-8 40-28 2-10 0-20-6-22-6-2-10 4-8 12 2 12-6 22-22 22z"
          :fill="COAT"
          :stroke="LINE"
          stroke-width="5"
          stroke-linejoin="round"
        />
        <path d="M190 176c3 8 1 16-4 22" fill="none" :stroke="COAT_HI" stroke-width="3.500" stroke-linecap="round" />
      </g>

      <!-- cuerpo sentado -->
      <g class="mocca-body">
        <!-- patas -->
        <g :stroke="LINE" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
          <path d="M72 240c0-9 9-15 21-15s21 6 21 15c0 6-9 9-21 9s-21-3-21-9z" :fill="TAN" />
          <path d="M126 240c0-9 9-15 21-15s21 6 21 15c0 6-9 9-21 9s-21-3-21-9z" :fill="TAN" />
          <path d="M86 240v6M99 240v6M141 240v6M154 240v6" fill="none" stroke-width="3" />
        </g>
        <path
          d="M120 148c30 0 52 22 55 54 2 26-16 42-55 42s-57-16-55-42c3-32 25-54 55-54z"
          :fill="COAT"
          :stroke="LINE"
          stroke-width="5"
          stroke-linejoin="round"
        />
        <!-- sombra bajo la cabeza y en la base -->
        <path d="M78 176c12 10 26 14 42 14s30-4 42-14c-6-16-22-26-42-26s-36 10-42 26z" :fill="COAT_DARK" />
        <path d="M70 222c10 12 28 18 50 18s40-6 50-18c0 14-18 22-50 22s-50-8-50-22z" :fill="COAT_DARK" opacity="0.7" />
        <!-- pecho crema con mechones -->
        <path
          d="M96 184l7-7 5 6 6-8 6 7 6-7 6 8 5-6 7 7c5 18-3 44-24 46-21-2-29-28-24-46z"
          :fill="CREAM"
          :stroke="LINE"
          stroke-width="3.500"
          stroke-linejoin="round"
        />
        <path d="M112 204l3 5M126 204l-3 5M119 214v6" fill="none" :stroke="TAN" stroke-width="2.500" stroke-linecap="round" opacity="0.7" />
        <!-- mechoncitos del costado -->
        <path d="M70 206l-7 3 6 4M170 206l7 3-6 4" fill="none" :stroke="LINE" stroke-width="3.500" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M80 196q-4 10 0 20M160 196q4 10 0 20" fill="none" :stroke="COAT_HI" stroke-width="3" stroke-linecap="round" />
      </g>

      <!-- collar lila con la placa (la medalla de oro cuando está orgullosa) -->
      <g class="mocca-collar" stroke-linecap="round" stroke-linejoin="round">
        <path d="M84 160q36 22 72 0" fill="none" :stroke="LINE" stroke-width="13" />
        <path d="M84 160q36 22 72 0" fill="none" stroke="var(--vq-lilac)" stroke-width="7" />
        <template v-if="mood === 'proud'">
          <path d="M108 172l8 14M132 172l-8 14" fill="none" :stroke="LINE" stroke-width="9" />
          <path d="M108 172l8 14" fill="none" stroke="var(--vq-sky)" stroke-width="4.500" />
          <path d="M132 172l-8 14" fill="none" stroke="var(--vq-pink)" stroke-width="4.500" />
          <circle cx="120" cy="196" r="16" :fill="GOLD" :stroke="LINE" stroke-width="4.500" />
          <circle cx="120" cy="196" r="10.500" fill="none" :stroke="GOLD_DEEP" stroke-width="2.500" />
          <path d="M114 201v-10l6 7 6-7v10" fill="none" :stroke="LINE" stroke-width="3" />
        </template>
        <template v-else>
          <circle cx="120" cy="180" r="11.500" :fill="GOLD" :stroke="LINE" stroke-width="4.500" />
          <path d="M114.500 185v-10l5.500 6.500 5.500-6.500v10" fill="none" :stroke="LINE" stroke-width="3" />
          <path d="M112 174q2-4 6-5" fill="none" stroke="#fff" stroke-width="2" opacity="0.8" />
        </template>
      </g>

      <!-- cabeza (orejas detrás) -->
      <g class="mocca-head">
        <g class="mocca-ear mocca-ear--l">
          <path d="M66 92C50 66 44 34 52 12c3-8 12-9 18-3 20 18 36 40 44 60z" :fill="COAT" :stroke="LINE" stroke-width="5" stroke-linejoin="round" />
          <path d="M68 78C58 58 55 38 59 24c15 13 27 29 34 44z" :fill="EAR_IN" />
          <path d="M64 44q4 12 12 22" fill="none" :stroke="BLUSH" stroke-width="3" stroke-linecap="round" opacity="0.7" />
        </g>
        <g class="mocca-ear mocca-ear--r">
          <path d="M174 92c16-26 22-58 14-80-3-8-12-9-18-3-20 18-36 40-44 60z" :fill="COAT" :stroke="LINE" stroke-width="5" stroke-linejoin="round" />
          <path d="M172 78c10-20 13-40 9-54-15 13-27 29-34 44z" :fill="EAR_IN" />
          <path d="M176 44q-4 12-12 22" fill="none" :stroke="BLUSH" stroke-width="3" stroke-linecap="round" opacity="0.7" />
        </g>

        <!-- cabeza con copete y mechones en los cachetes -->
        <path
          d="M108 44l5-11 7 9 7-10 5 12c32 5 52 30 52 60 0 9-2 17-5 24l9 6-12 5 4 10-15 0c-12 11-27 16-45 16s-33-5-45-16l-15 0 4-10-12-5 9-6c-3-7-5-15-5-24 0-30 20-55 52-60z"
          :fill="COAT"
          :stroke="LINE"
          stroke-width="5"
          stroke-linejoin="round"
        />
        <!-- brillo del pelaje -->
        <path d="M72 96q2-20 18-34" fill="none" :stroke="COAT_HI" stroke-width="6" stroke-linecap="round" />
        <path d="M66 112q0-4 1-8" fill="none" :stroke="COAT_HI" stroke-width="5" stroke-linecap="round" />

        <!-- hocico caramelo -->
        <path d="M120 112c20 0 34 9 36 22 2 14-13 24-36 24s-38-10-36-24c2-13 16-22 36-22z" :fill="TAN" />
        <path d="M92 146c8 8 17 11 28 11s20-3 28-11c-5 9-15 13-28 13s-23-4-28-13z" :fill="TAN_DARK" opacity="0.55" />
        <!-- cejitas -->
        <g v-if="mood !== 'proud'" :fill="TAN" class="mocca-brows">
          <ellipse class="mocca-brow mocca-brow--l" cx="96" cy="80" rx="8" ry="5.500" />
          <ellipse class="mocca-brow mocca-brow--r" cx="144" cy="80" rx="8" ry="5.500" />
        </g>
        <!-- cachetes -->
        <ellipse cx="76" cy="130" rx="9" ry="5.500" :fill="BLUSH" opacity="0.85" />
        <ellipse cx="164" cy="130" rx="9" ry="5.500" :fill="BLUSH" opacity="0.85" />

        <!-- ojos -->
        <g class="mocca-eyes">
          <!-- celebrando: ojitos cerrados de risa -->
          <g v-if="mood === 'celebrating'" fill="none" :stroke="LINE" stroke-width="5.500" stroke-linecap="round">
            <path d="M86 104q10-14 20 0M134 104q10-14 20 0" />
          </g>
          <!-- sorprendida: ojos blancos grandes con pupila pequeña -->
          <g v-else-if="mood === 'surprised'">
            <ellipse cx="96" cy="100" rx="13" ry="15" fill="#fff" :stroke="LINE" stroke-width="4" />
            <ellipse cx="144" cy="100" rx="13" ry="15" fill="#fff" :stroke="LINE" stroke-width="4" />
            <circle cx="98" cy="102" r="6" :fill="LINE" />
            <circle cx="142" cy="102" r="6" :fill="LINE" />
            <circle cx="100" cy="100" r="1.800" fill="#fff" />
            <circle cx="144" cy="100" r="1.800" fill="#fff" />
          </g>
          <!-- asombrada (examen perfecto): ojos completamente blancos que brillan, con destellos -->
          <g v-else-if="mood === 'amazed'">
            <g class="mocca-glow">
              <path d="M82 96c0-9 6-15 14-15s14 6 14 15c0 10-6 17-14 17s-14-7-14-17z" fill="#fff" :stroke="LINE" stroke-width="4" stroke-linejoin="round" />
              <path d="M130 96c0-9 6-15 14-15s14 6 14 15c0 10-6 17-14 17s-14-7-14-17z" fill="#fff" :stroke="LINE" stroke-width="4" stroke-linejoin="round" />
            </g>
            <g class="mocca-starglint" fill="#fff">
              <path d="M108 78c1 6 3 8 9 9-6 1-8 3-9 9-1-6-3-8-9-9 6-1 8-3 9-9z" />
              <path d="M156 78c1 6 3 8 9 9-6 1-8 3-9 9-1-6-3-8-9-9 6-1 8-3 9-9z" />
            </g>
          </g>
          <!-- orgullosa: gafas de sol -->
          <g v-else-if="mood === 'proud'" class="mocca-shades">
            <path d="M74 96q46-8 92 0" fill="none" :stroke="LINE" stroke-width="5" stroke-linecap="round" />
            <path d="M76 92h38c2 0 3 2 3 4 0 12-8 20-20 20s-22-8-22-20c0-2 0-4 1-4z" :fill="LINE" />
            <path d="M126 92h38c1 0 1 2 1 4 0 12-10 20-22 20s-20-8-20-20c0-2 1-4 3-4z" :fill="LINE" />
            <path d="M84 97l10-2M134 97l10-2" fill="none" stroke="#fff" stroke-width="3.500" stroke-linecap="round" opacity="0.85" />
            <path class="mocca-glint" d="M88 112l14-18" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0" />
          </g>
          <!-- normales: grandes y brillantes -->
          <g v-else class="mocca-blink">
            <g :class="mood === 'thinking' && 'mocca-look-up'">
              <ellipse cx="96" cy="101" rx="10" ry="12" :fill="LINE" />
              <ellipse cx="144" cy="101" rx="10" ry="12" :fill="LINE" />
              <circle cx="100" cy="96.500" r="3.800" fill="#fff" />
              <circle cx="148" cy="96.500" r="3.800" fill="#fff" />
              <circle cx="93" cy="106" r="1.800" fill="#fff" opacity="0.9" />
              <circle cx="141" cy="106" r="1.800" fill="#fff" opacity="0.9" />
            </g>
            <!-- triste: párpado caído y ojos aguados -->
            <g v-if="mood === 'sad'">
              <path d="M83 100q10-10 26-9v-9h-26zM157 100q-10-10-26-9v-9h26z" :fill="COAT" />
              <path d="M83 100q10-10 26-9M157 100q-10-10-26-9" fill="none" :stroke="LINE" stroke-width="3.500" stroke-linecap="round" />
              <ellipse cx="96" cy="109" rx="5" ry="2.500" fill="#fff" opacity="0.75" />
              <ellipse cx="144" cy="109" rx="5" ry="2.500" fill="#fff" opacity="0.75" />
            </g>
          </g>
        </g>

        <!-- nariz -->
        <path d="M110 121c0-5 5-7 10-7s10 2 10 7-6 9-10 9-10-4-10-9z" :fill="LINE" />
        <ellipse cx="116" cy="118" rx="3.200" ry="1.700" fill="#fff" opacity="0.75" />

        <!-- boca -->
        <g fill="none" :stroke="LINE" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
          <template v-if="mood === 'happy' || mood === 'celebrating'">
            <path d="M120 130v4" />
            <path d="M104 134q16 24 32 0z" :fill="LINE" />
            <path d="M112 145q8-7 16 0-2 7-8 7t-8-7z" :fill="EAR_IN" stroke="none" />
          </template>
          <template v-else-if="mood === 'proud'">
            <path d="M120 130v4" />
            <path d="M106 136q10 9 22 5 6-2 8-8" />
          </template>
          <template v-else-if="mood === 'thinking'">
            <path d="M120 130v5" />
            <path d="M111 139q9 4 17-3" />
          </template>
          <template v-else-if="mood === 'surprised'">
            <path d="M120 130v3" />
            <ellipse cx="120" cy="141" rx="6" ry="7.500" :fill="LINE" />
          </template>
          <template v-else-if="mood === 'amazed'">
            <path d="M120 130v3" />
            <path d="M100 134q20 30 40 0z" :fill="LINE" />
            <path d="M104 136h32l-3 5h-26z" fill="#fff" stroke="none" />
            <path d="M111 149q9-7 18 0-2 7-9 7t-9-7z" :fill="EAR_IN" stroke="none" />
          </template>
          <template v-else>
            <path d="M120 130v6" />
            <path d="M109 144q11-9 22 0" />
          </template>
        </g>

        <!-- lágrima -->
        <path v-if="mood === 'sad'" class="mocca-tear" d="M170 104c4 8 8 12 8 17a8 8 0 0 1-16 0c0-5 4-9 8-17z" fill="var(--vq-sky)" :stroke="LINE" stroke-width="3.500" stroke-linejoin="round" />
      </g>

      <!-- bracitos (delante de todo: saludan, se levantan, van a la barbilla) -->
      <g class="mocca-arm mocca-arm--l" :style="{ '--arm': `${arms[0]}deg` }">
        <path d="M78 170c-10 4-16 18-15 32 1 9 8 13 14 10 6-3 8-10 8-18 0-9 0-16-1-22z" :fill="COAT" :stroke="LINE" stroke-width="5" stroke-linejoin="round" />
        <path d="M63 200c1 10 8 15 15 12 5-3 7-8 7-13-6 4-15 5-22 1z" :fill="TAN" :stroke="LINE" stroke-width="4" stroke-linejoin="round" />
        <path d="M70 208v4M76 207v4" fill="none" :stroke="LINE" stroke-width="2.500" stroke-linecap="round" />
      </g>
      <g class="mocca-arm mocca-arm--r" :style="{ '--arm': `${arms[1]}deg` }">
        <path d="M162 170c10 4 16 18 15 32-1 9-8 13-14 10-6-3-8-10-8-18 0-9 0-16 1-22z" :fill="COAT" :stroke="LINE" stroke-width="5" stroke-linejoin="round" />
        <path d="M177 200c-1 10-8 15-15 12-5-3-7-8-7-13 6 4 15 5 22 1z" :fill="TAN" :stroke="LINE" stroke-width="4" stroke-linejoin="round" />
        <path d="M170 208v4M164 207v4" fill="none" :stroke="LINE" stroke-width="2.500" stroke-linecap="round" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
/* borde blanco "troquelado": se lee en fondo oscuro y claro */
.mocca {
  filter: drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff);
}
.mocca * {
  transform-box: view-box;
}

/* ── partes: dónde giran ── */
.mocca-all {
  transform-origin: 120px 246px;
}
.mocca-body {
  transform-origin: 120px 246px;
  animation: breathe 3.200s ease-in-out infinite;
}
.mocca-head {
  transform-origin: 120px 160px;
  animation: head-bob 3.200s ease-in-out infinite 0.150s;
}
.mocca-collar {
  animation: head-bob 3.200s ease-in-out infinite 0.080s;
}
.mocca-ear--l {
  transform-origin: 84px 78px;
  animation: ear-l 5.500s ease-in-out infinite;
}
.mocca-ear--r {
  transform-origin: 156px 78px;
  animation: ear-r 5.500s ease-in-out infinite 1.700s;
}
.mocca-tail {
  transform-origin: 162px 212px;
  animation: wag 0.550s ease-in-out infinite alternate;
}
.mocca-arm {
  transition: transform 0.450s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform: rotate(var(--arm));
}
.mocca-arm--l {
  transform-origin: 80px 174px;
}
.mocca-arm--r {
  transform-origin: 160px 174px;
}
.mocca-blink {
  transform-origin: 120px 101px;
  animation: blink 4.600s infinite;
}
.mocca-brow {
  transition: transform 0.300s ease;
}
.mocca-brow--l {
  transform-origin: 96px 80px;
}
.mocca-brow--r {
  transform-origin: 144px 80px;
}

/* ── feliz: saluda de vez en cuando ── */
.mocca--happy .mocca-arm--l {
  animation: wave 6s ease-in-out infinite 1.200s;
}

/* ── pensando: cabeza ladeada, mira hacia arriba, patita en la barbilla ── */
.mocca--thinking .mocca-head {
  animation: think 3.600s ease-in-out infinite;
}
.mocca--thinking .mocca-look-up {
  transform: translate(3px, -4px);
}
.mocca--thinking .mocca-brow--r {
  transform: translateY(-7px) rotate(10deg);
}
.mocca--thinking .mocca-tail {
  animation-duration: 1.700s;
}
.mocca--thinking .mocca-arm--r {
  animation: tap 1.800s ease-in-out infinite;
}
.mocca-bubbles {
  animation: bob 1.800s ease-in-out infinite;
}

/* ── sorprendida: brinquito y orejas tiesas ── */
.mocca--surprised .mocca-all {
  animation: startle 2.400s ease-in-out infinite;
}
.mocca--surprised .mocca-ear--l,
.mocca--amazed .mocca-ear--l {
  animation: none;
  transform: rotate(-9deg);
}
.mocca--surprised .mocca-ear--r,
.mocca--amazed .mocca-ear--r {
  animation: none;
  transform: rotate(9deg);
}
.mocca--surprised .mocca-brow {
  transform: translateY(-10px);
}
.mocca--surprised .mocca-tail {
  animation: none;
  transform: rotate(-16deg);
}

/* ── celebrando: brinca con aplastón y estirón, brazos arriba, cola a mil ── */
.mocca--celebrating .mocca-all {
  animation: hop 0.700s cubic-bezier(0.3, 0, 0.4, 1) infinite;
}
.mocca--celebrating .mocca-shadow {
  animation: hop-shadow 0.700s cubic-bezier(0.3, 0, 0.4, 1) infinite;
  transform-origin: 120px 248px;
}
.mocca--celebrating .mocca-tail {
  animation-duration: 0.220s;
}
.mocca--celebrating .mocca-arm--l {
  animation: cheer-l 0.350s ease-in-out infinite alternate;
}
.mocca--celebrating .mocca-arm--r {
  animation: cheer-r 0.350s ease-in-out infinite alternate;
}
.mocca--celebrating .mocca-ear--l {
  animation: flap-l 0.700s ease-in-out infinite;
}
.mocca--celebrating .mocca-ear--r {
  animation: flap-r 0.700s ease-in-out infinite;
}
.mocca-sparkles {
  animation: twinkle 0.900s ease-in-out infinite alternate;
  transform-origin: 120px 120px;
}

/* ── triste: orejas caídas, cabeza gacha, cola quieta, lágrima que cae ── */
.mocca--sad .mocca-head {
  animation: droop 4.400s ease-in-out infinite;
}
.mocca--sad .mocca-ear--l {
  animation: none;
  transform: rotate(-38deg);
}
.mocca--sad .mocca-ear--r {
  animation: none;
  transform: rotate(38deg);
}
.mocca--sad .mocca-brow--l {
  transform: rotate(-22deg) translateY(-3px);
}
.mocca--sad .mocca-brow--r {
  transform: rotate(22deg) translateY(-3px);
}
.mocca--sad .mocca-tail {
  animation: none;
  transform: rotate(46deg);
}
.mocca--sad .mocca-blink {
  animation-duration: 3s;
}
.mocca-tear {
  animation: tear 2.600s ease-in infinite;
}

/* ── asombrada (examen perfecto): pose de poder, ojos blancos que brillan ── */
.mocca--amazed .mocca-all {
  animation: power 1.100s ease-in-out infinite;
}
.mocca--amazed .mocca-tail {
  animation-duration: 0.200s;
}
.mocca--amazed .mocca-arm--l {
  animation: cheer-l 0.550s ease-in-out infinite alternate;
}
.mocca--amazed .mocca-arm--r {
  animation: cheer-r 0.550s ease-in-out infinite alternate;
}
.mocca--amazed .mocca-brow--l {
  transform: translateY(-6px) rotate(20deg);
}
.mocca--amazed .mocca-brow--r {
  transform: translateY(-6px) rotate(-20deg);
}
.mocca-glow {
  animation: eye-glow 1.100s ease-in-out infinite;
}
.mocca-starglint path {
  transform-box: fill-box;
  transform-origin: center;
  animation: starglint 1.100s ease-in-out infinite;
}
.mocca-starglint path:nth-child(2) {
  animation-delay: 0.300s;
}

/* ── orgullosa: gafas, pecho afuera, asiente con calma, destello en las gafas ── */
.mocca--proud .mocca-body {
  animation: puff 1.800s ease-in-out infinite;
}
.mocca--proud .mocca-head {
  animation: nod 2.400s ease-in-out infinite;
}
.mocca--proud .mocca-glint {
  animation: glint 2.400s ease-in-out infinite;
}
.mocca--proud .mocca-tail {
  animation-duration: 0.900s;
}

@keyframes breathe {
  50% {
    transform: scale(1.025, 0.982);
  }
}
@keyframes head-bob {
  50% {
    transform: translateY(2.500px);
  }
}
@keyframes ear-l {
  0%,
  86%,
  100% {
    transform: rotate(0);
  }
  90% {
    transform: rotate(-11deg);
  }
  94% {
    transform: rotate(4deg);
  }
}
@keyframes ear-r {
  0%,
  86%,
  100% {
    transform: rotate(0);
  }
  90% {
    transform: rotate(11deg);
  }
  94% {
    transform: rotate(-4deg);
  }
}
@keyframes wag {
  from {
    transform: rotate(-9deg);
  }
  to {
    transform: rotate(16deg);
  }
}
@keyframes blink {
  0%,
  92%,
  100% {
    transform: scaleY(1);
  }
  95.500% {
    transform: scaleY(0.080);
  }
}
@keyframes wave {
  0%,
  58%,
  100% {
    transform: rotate(var(--arm));
  }
  66% {
    transform: rotate(138deg);
  }
  72% {
    transform: rotate(112deg);
  }
  78% {
    transform: rotate(138deg);
  }
  84% {
    transform: rotate(112deg);
  }
  92% {
    transform: rotate(var(--arm));
  }
}
@keyframes think {
  0%,
  100% {
    transform: rotate(-7deg) translateY(0);
  }
  50% {
    transform: rotate(-3deg) translateY(2px);
  }
}
@keyframes tap {
  0%,
  100% {
    transform: rotate(var(--arm));
  }
  50% {
    transform: rotate(calc(var(--arm) - 7deg));
  }
}
@keyframes bob {
  50% {
    transform: translateY(-5px);
  }
}
@keyframes startle {
  0%,
  70%,
  100% {
    transform: translateY(0) scale(1);
  }
  76% {
    transform: translateY(0) scale(1.050, 0.940);
  }
  84% {
    transform: translateY(-9px) scale(0.970, 1.040);
  }
  92% {
    transform: translateY(0) scale(1.020, 0.980);
  }
}
@keyframes hop {
  0%,
  100% {
    transform: translateY(0) scale(1.070, 0.920);
  }
  45% {
    transform: translateY(-20px) scale(0.950, 1.060);
  }
  70% {
    transform: translateY(-14px) scale(1, 1);
  }
}
@keyframes hop-shadow {
  0%,
  100% {
    transform: scaleX(1.080);
    opacity: 0.160;
  }
  45% {
    transform: scaleX(0.760);
    opacity: 0.080;
  }
}
@keyframes cheer-l {
  from {
    transform: rotate(calc(var(--arm) - 10deg));
  }
  to {
    transform: rotate(calc(var(--arm) + 12deg));
  }
}
@keyframes cheer-r {
  from {
    transform: rotate(calc(var(--arm) + 10deg));
  }
  to {
    transform: rotate(calc(var(--arm) - 12deg));
  }
}
@keyframes flap-l {
  50% {
    transform: rotate(-12deg);
  }
}
@keyframes flap-r {
  50% {
    transform: rotate(12deg);
  }
}
@keyframes twinkle {
  from {
    opacity: 0.450;
    transform: scale(0.960);
  }
  to {
    opacity: 1;
    transform: scale(1.030);
  }
}
@keyframes droop {
  0%,
  100% {
    transform: translateY(5px) rotate(-2deg);
  }
  50% {
    transform: translateY(7px) rotate(2deg);
  }
}
@keyframes tear {
  0%,
  20% {
    transform: translateY(-4px) scale(0.600);
    opacity: 0;
  }
  35% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  80% {
    transform: translateY(26px) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(40px) scale(0.800);
    opacity: 0;
  }
}
@keyframes power {
  50% {
    transform: scale(1.035, 1.035) translateY(-2px);
  }
}
@keyframes eye-glow {
  0%,
  100% {
    filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 8px #ffe58a);
  }
  50% {
    filter: drop-shadow(0 0 7px #fff) drop-shadow(0 0 20px #ffd23f) drop-shadow(0 0 34px #ffb300);
  }
}
@keyframes starglint {
  0%,
  100% {
    transform: scale(0.500) rotate(0);
    opacity: 0.600;
  }
  50% {
    transform: scale(1.250) rotate(45deg);
    opacity: 1;
  }
}
@keyframes tremble {
  0% {
    transform: translate(-1.500px, 0) rotate(-1.200deg);
  }
  50% {
    transform: translate(1.500px, -1px) rotate(1.200deg);
  }
  100% {
    transform: translate(-1.500px, 0) rotate(-1.200deg);
  }
}
@keyframes puff {
  50% {
    transform: scale(1.050, 0.985);
  }
}
@keyframes nod {
  0%,
  100% {
    transform: rotate(-3deg);
  }
  50% {
    transform: rotate(3deg) translateY(2px);
  }
}
@keyframes glint {
  0%,
  60%,
  100% {
    opacity: 0;
    transform: translateX(-8px);
  }
  70% {
    opacity: 0.950;
  }
  82% {
    opacity: 0;
    transform: translateX(52px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mocca *,
  .mocca {
    animation: none !important;
    transition: none !important;
  }
}
</style>
