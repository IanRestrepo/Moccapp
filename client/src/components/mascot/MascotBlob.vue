<script setup lang="ts">
import { computed } from 'vue'
import type { MoccaMood } from '@vetquiz/shared'

/**
 * Mocca, redibujada: cabeza y cuerpo separados, mechones de pelo en cachetes y pecho, bracitos, patas con deditos
 * y cola. Contorno café oscuro grueso, colores planos con sombras suaves (estilo ilustración de sticker).
 * Conserva lo suyo: orejas grandes y paradas, cejitas y hocico caramelo, pecho crema, collar lila con la placa de la M.
 * Cada parte se anima por separado: respira, parpadea, mueve las orejas y la cola, y cada ánimo tiene su pose.
 */
/**
 * happy (inicio) · thinking (generando) · surprised (poco tiempo) · celebrating (nota ≥ 3.0) · sad (nota baja)
 * amazed (examen perfecto, entrada: ojos de estrella blancos que brillan, pose de poder) · proud (examen perfecto, resumen: gafas de sol y medalla de oro)
 */
/** Las 25 caras están listadas en shared (MOCCA_MOODS): aquí está el dibujo de cada una */
export type MascotMood = MoccaMood
/**
 * Acciones de cuerpo entero (para escenas, como la del examen perfecto). Deforman el dibujo completo como en los
 * dibujos animados: se inclina al correr, se estira al saltar y se aplasta al caer.
 * run (corre hacia la derecha) · slip (frena, se resbala y se va de espaldas) · waddle (camina de vuelta)
 * crouch (se agacha para tomar impulso) · jump (salta de emoción)
 */
export type MascotAct = 'run' | 'slip' | 'waddle' | 'crouch' | 'jump'

const props = withDefaults(defineProps<{ mood?: MascotMood; size?: number; label?: string; act?: MascotAct }>(), { mood: 'happy', size: 160 })

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

/**
 * Cada ánimo es una combinación de piezas: ojos, párpados, mirada, boca, pose de brazos, cejas, orejas, cola,
 * movimiento y un accesorio. Los 7 primeros además tienen ajustes propios en el CSS (.mocca--feliz, etc.).
 */
type Eyes = 'open' | 'laugh' | 'white' | 'glow' | 'shades' | 'closed' | 'stars' | 'hearts' | 'scared'
type Mouth =
  | 'smile' | 'smirk' | 'hmm' | 'o' | 'grin' | 'frown' | 'gritted' | 'yawn' | 'wavy' | 'slant' | 'cat' | 'none'
  | 'puff' | 'flat' | 'drool' | 'tongue' | 'scream' | 'smileO'
type Extra =
  | 'anger' | 'zzz' | 'sparkles' | 'sweat' | 'question' | 'lens' | 'hearts' | 'lines' | 'puff' | 'spark1' | 'notes'
  | 'cutlery' | 'bone' | 'shiver' | 'bangs'
interface Look {
  eyes: Eyes
  /** párpado sobre los ojos abiertos */
  lid?: 'sad' | 'angry' | 'firm' | 'half'
  look?: 'up' | 'side' | 'down'
  mouth: Mouth
  /** brazos: grados de giro desde "abajo" (izq., der.) */
  arms: [number, number]
  /** cejas: giro y subida de la izquierda, giro y subida de la derecha */
  brows?: [number, number, number, number]
  /** orejas: giro de la izquierda y de la derecha (negativo/positivo = hacia afuera) */
  ears?: [number, number]
  tail?: 'fast' | 'slow' | 'still' | 'down'
  anim?: 'bounce' | 'tremble' | 'sway' | 'nod' | 'shake' | 'pump'
  /** cabeza ladeada, en grados */
  tilt?: number
  /** tamaño del sonrojo (1 = normal) */
  blush?: number
  extra?: Extra
}
const LOOKS: Record<MascotMood, Look> = {
  happy: { eyes: 'open', mouth: 'smile', arms: [8, -8] },
  thinking: { eyes: 'open', mouth: 'hmm', arms: [6, 128] },
  surprised: { eyes: 'white', mouth: 'o', arms: [52, -52] },
  celebrating: { eyes: 'laugh', mouth: 'smile', arms: [128, -128] },
  sad: { eyes: 'open', lid: 'sad', mouth: 'frown', arms: [2, -2] },
  amazed: { eyes: 'glow', mouth: 'grin', arms: [138, -138] },
  proud: { eyes: 'shades', mouth: 'smirk', arms: [34, -34] },

  angry: { eyes: 'open', lid: 'angry', mouth: 'gritted', arms: [26, -26], brows: [24, 5, -24, 5], ears: [-16, 16], tail: 'still', anim: 'shake', extra: 'anger' },
  sleepy: { eyes: 'closed', mouth: 'yawn', arms: [4, -4], brows: [-8, -2, 8, -2], ears: [-26, 26], tail: 'still', anim: 'nod', extra: 'zzz' },
  excited: { eyes: 'stars', mouth: 'smile', arms: [150, -150], brows: [0, -6, 0, -6], tail: 'fast', anim: 'bounce', extra: 'sparkles' },
  nervous: { eyes: 'open', look: 'side', mouth: 'wavy', arms: [-22, 22], brows: [-18, -3, 18, -3], ears: [-10, 10], tail: 'still', anim: 'tremble', extra: 'sweat' },
  confused: { eyes: 'open', look: 'up', mouth: 'slant', arms: [6, -6], brows: [-8, -9, 14, 2], tilt: 9, tail: 'slow', extra: 'question' },
  curious: { eyes: 'open', mouth: 'cat', arms: [6, 168], brows: [0, -5, 0, -5], ears: [6, -6], tail: 'fast', extra: 'lens' },
  shy: { eyes: 'closed', mouth: 'none', arms: [-139, 139], brows: [-10, -2, 10, -2], ears: [-18, 18], blush: 1.55, tail: 'slow', anim: 'sway' },
  inlove: { eyes: 'hearts', mouth: 'smile', arms: [-34, 34], brows: [0, -6, 0, -6], blush: 1.4, tail: 'fast', extra: 'hearts' },
  anxious: { eyes: 'open', look: 'side', mouth: 'none', arms: [4, 139], brows: [-20, -3, 20, -3], ears: [-12, 12], tail: 'still', anim: 'tremble', extra: 'lines' },
  relieved: { eyes: 'closed', mouth: 'puff', arms: [6, -6], brows: [-10, -5, 10, -5], tail: 'slow', extra: 'puff' },
  motivated: { eyes: 'open', lid: 'firm', mouth: 'smirk', arms: [150, -24], brows: [16, 3, -16, 3], tail: 'fast', anim: 'pump', extra: 'spark1' },
  relaxed: { eyes: 'closed', mouth: 'cat', arms: [6, -6], ears: [-8, 8], tail: 'slow', anim: 'sway', extra: 'notes' },
  bored: { eyes: 'open', lid: 'half', look: 'side', mouth: 'flat', arms: [4, -176], tilt: 7, ears: [-16, 16], tail: 'still' },
  eager: { eyes: 'stars', mouth: 'drool', arms: [84, -84], tail: 'fast', anim: 'bounce', extra: 'cutlery' },
  hungry: { eyes: 'laugh', mouth: 'tongue', arms: [8, -8], tail: 'fast', extra: 'bone' },
  scared: { eyes: 'scared', mouth: 'scream', arms: [124, -124], brows: [-20, -8, 20, -8], ears: [-30, 30], tail: 'down', anim: 'tremble', extra: 'shiver' },
  confident: { eyes: 'closed', mouth: 'smirk', arms: [34, -34], brows: [8, -2, -8, -2], tilt: -4, tail: 'slow', extra: 'spark1' },
  delighted: { eyes: 'white', mouth: 'smileO', arms: [70, -70], brows: [0, -10, 0, -10], tail: 'fast', anim: 'bounce', extra: 'bangs' },
}
const look = computed(() => LOOKS[props.mood])
const arms = computed(() => look.value.arms)
const gaze = computed(() => ({ up: 'translate(3px, -4px)', side: 'translate(4.500px, 1px)', down: 'translate(0, 4px)' })[look.value.look ?? 'up'])
const PINK = '#FF6B95'
const BLUE = '#7FB4FF'
</script>

<template>
  <svg :width="size" :height="size * 1.08" viewBox="0 0 240 260" role="img" :aria-label="label ?? 'Mocca'" :class="['mocca overflow-visible', `mocca--${mood}`, look.anim && `mocca-anim-${look.anim}`, look.tail && `mocca-tail-${look.tail}`, act && `mocca--act-${act}`]">
    <ellipse cx="120" cy="248" rx="62" ry="8" :fill="LINE" opacity="0.14" class="mocca-shadow" />

    <!-- destellos de fiesta / orgullo -->
    <g v-if="mood === 'celebrating' || mood === 'proud' || look.extra === 'sparkles'" class="mocca-sparkles" :stroke="LINE" stroke-width="3" stroke-linejoin="round">
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

    <!-- accesorios de cada ánimo (trazo doble: se leen en fondo claro y oscuro) -->
    <g v-if="look.extra === 'anger'" class="mocca-pulse" fill="none" stroke-linecap="round">
      <path d="M190 40q9 2 9 11M214 40q-9 2-9 11M190 68q9-2 9-11M214 68q-9-2-9-11" :stroke="LINE" stroke-width="10" />
      <path d="M190 40q9 2 9 11M214 40q-9 2-9 11M190 68q9-2 9-11M214 68q-9-2-9-11" stroke="#F0454B" stroke-width="5" />
    </g>
    <g v-if="look.extra === 'zzz'" class="mocca-bubbles" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M186 50h16l-16 18h16M210 22h11l-11 13h11" :stroke="LINE" stroke-width="9" />
      <path d="M186 50h16l-16 18h16M210 22h11l-11 13h11" stroke="#fff" stroke-width="4" />
    </g>
    <g v-if="look.extra === 'question'" class="mocca-bubbles" fill="none" stroke-linecap="round">
      <path d="M194 40c0-11 8-16 16-16s15 5 15 14c0 11-13 11-13 21" :stroke="LINE" stroke-width="10" />
      <path d="M194 40c0-11 8-16 16-16s15 5 15 14c0 11-13 11-13 21" stroke="#fff" stroke-width="4.500" />
      <circle cx="212" cy="73" r="5.500" fill="#fff" :stroke="LINE" stroke-width="3" />
    </g>
    <g v-if="look.extra === 'bangs'" class="mocca-pulse" stroke-linecap="round">
      <path d="M202 22l-5 28M224 30l-9 26" fill="none" :stroke="LINE" stroke-width="12" />
      <path d="M202 22l-5 28M224 30l-9 26" fill="none" :stroke="GOLD" stroke-width="6" />
      <circle cx="195" cy="64" r="5.500" :fill="GOLD" :stroke="LINE" stroke-width="3" />
      <circle cx="211" cy="69" r="5.500" :fill="GOLD" :stroke="LINE" stroke-width="3" />
    </g>
    <g v-if="look.extra === 'hearts'" class="mocca-hearts" :fill="PINK" :stroke="LINE" stroke-width="3" stroke-linejoin="round">
      <path d="M204 62c-13-9-16-16-13-21 3-5 10-5 13 1 3-6 10-6 13-1 3 5 0 12-13 21z" />
      <path d="M224 30c-8-6-10-10-8-13 2-3 6-3 8 1 2-4 6-4 8-1 2 3 0 7-8 13z" />
      <path d="M186 28c-6-4-7-7-6-9 1-2 4-2 6 0 2-2 5-2 6 0 1 2 0 5-6 9z" />
    </g>
    <g v-if="look.extra === 'notes'" class="mocca-bubbles" stroke-linecap="round" stroke-linejoin="round">
      <path d="M196 62V34l18-5v26" fill="none" :stroke="LINE" stroke-width="9" />
      <path d="M196 62V34l18-5v26" fill="none" stroke="#fff" stroke-width="4" />
      <ellipse cx="190" cy="63" rx="7.500" ry="6" fill="#fff" :stroke="LINE" stroke-width="3" />
      <ellipse cx="208" cy="56" rx="7.500" ry="6" fill="#fff" :stroke="LINE" stroke-width="3" />
    </g>
    <g v-if="look.extra === 'bone'" class="mocca-bubbles">
      <circle cx="186" cy="74" r="5" fill="#fff" :stroke="LINE" stroke-width="3.500" />
      <ellipse cx="208" cy="42" rx="27" ry="21" fill="#fff" :stroke="LINE" stroke-width="3.500" />
      <g :fill="GOLD" :stroke="LINE" stroke-width="3" stroke-linejoin="round">
        <path d="M196 38a5 5 0 1 1 7-6l10 8a5 5 0 1 1 7 6 5 5 0 1 1-7 6l-10-8a5 5 0 1 1-7-6z" />
      </g>
    </g>
    <g v-if="look.extra === 'shiver'" class="mocca-pulse" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M36 70l-7 9 7 9-7 9M204 70l7 9-7 9 7 9" :stroke="LINE" stroke-width="9" />
      <path d="M36 70l-7 9 7 9-7 9M204 70l7 9-7 9 7 9" stroke="#fff" stroke-width="4" />
    </g>
    <g v-if="look.extra === 'lines'" class="mocca-pulse" fill="none" stroke-linecap="round">
      <path d="M190 44l8-12M202 58l13-7M206 76h14" :stroke="LINE" stroke-width="9" />
      <path d="M190 44l8-12M202 58l13-7M206 76h14" stroke="#fff" stroke-width="4" />
    </g>
    <g v-if="look.extra === 'puff'" class="mocca-puff" fill="#fff" :stroke="LINE" stroke-width="3.500">
      <circle cx="172" cy="152" r="7" />
      <circle cx="186" cy="146" r="10" />
      <circle cx="199" cy="153" r="7.500" />
    </g>
    <path
      v-if="look.extra === 'spark1'"
      class="mocca-sparkles"
      d="M208 44c1.600 9 5.200 12.600 14 14-8.800 1.600-12.400 5-14 14-1.600-9-5.200-12.400-14-14 8.800-1.400 12.400-5 14-14z"
      fill="var(--vq-yellow)"
      :stroke="LINE"
      stroke-width="3"
      stroke-linejoin="round"
    />

    <g class="mocca-all">
      <!-- con ganas: tenedor y cuchara, bien parados -->
      <g v-if="look.extra === 'cutlery'" stroke-linecap="round" stroke-linejoin="round">
        <path d="M45 178V136" fill="none" :stroke="LINE" stroke-width="10" />
        <path d="M45 178V136" fill="none" stroke="#D9DEE8" stroke-width="5" />
        <path d="M35 108v18q0 10 10 10t10-10v-18" fill="#D9DEE8" :stroke="LINE" stroke-width="3.500" />
        <path d="M41.500 110v14M48.500 110v14" fill="none" :stroke="LINE" stroke-width="3" />
        <path d="M195 178V138" fill="none" :stroke="LINE" stroke-width="10" />
        <path d="M195 178V138" fill="none" stroke="#D9DEE8" stroke-width="5" />
        <ellipse cx="195" cy="122" rx="11" ry="15" fill="#D9DEE8" :stroke="LINE" stroke-width="3.500" />
        <path d="M190 114q2-5 6-6" fill="none" stroke="#fff" stroke-width="2.500" />
      </g>
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
        <g class="mocca-foot mocca-foot--l" :stroke="LINE" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
          <path d="M72 240c0-9 9-15 21-15s21 6 21 15c0 6-9 9-21 9s-21-3-21-9z" :fill="TAN" />
          <path d="M86 240v6M99 240v6" fill="none" stroke-width="3" />
        </g>
        <g class="mocca-foot mocca-foot--r" :stroke="LINE" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
          <path d="M126 240c0-9 9-15 21-15s21 6 21 15c0 6-9 9-21 9s-21-3-21-9z" :fill="TAN" />
          <path d="M141 240v6M154 240v6" fill="none" stroke-width="3" />
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
      <g class="mocca-head" :style="look.tilt ? { rotate: `${look.tilt}deg` } : undefined">
        <g class="mocca-ear mocca-ear--l" :style="look.ears ? { rotate: `${look.ears[0]}deg` } : undefined">
          <path d="M66 92C50 66 44 34 52 12c3-8 12-9 18-3 20 18 36 40 44 60z" :fill="COAT" :stroke="LINE" stroke-width="5" stroke-linejoin="round" />
          <path d="M68 78C58 58 55 38 59 24c15 13 27 29 34 44z" :fill="EAR_IN" />
          <path d="M64 44q4 12 12 22" fill="none" :stroke="BLUSH" stroke-width="3" stroke-linecap="round" opacity="0.7" />
        </g>
        <g class="mocca-ear mocca-ear--r" :style="look.ears ? { rotate: `${look.ears[1]}deg` } : undefined">
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
        <g v-if="look.eyes !== 'shades' && look.eyes !== 'glow'" :fill="TAN" class="mocca-brows">
          <ellipse
            class="mocca-brow mocca-brow--l"
            cx="96"
            cy="80"
            rx="8"
            ry="5.500"
            :style="look.brows ? { transform: `translateY(${look.brows[1]}px) rotate(${look.brows[0]}deg)` } : undefined"
          />
          <ellipse
            class="mocca-brow mocca-brow--r"
            cx="144"
            cy="80"
            rx="8"
            ry="5.500"
            :style="look.brows ? { transform: `translateY(${look.brows[3]}px) rotate(${look.brows[2]}deg)` } : undefined"
          />
        </g>
        <!-- cachetes -->
        <ellipse cx="76" cy="130" :rx="9 * (look.blush ?? 1)" :ry="5.500 * (look.blush ?? 1)" :fill="BLUSH" opacity="0.85" />
        <ellipse cx="164" cy="130" :rx="9 * (look.blush ?? 1)" :ry="5.500 * (look.blush ?? 1)" :fill="BLUSH" opacity="0.85" />
        <!-- gota de sudor -->
        <path v-if="look.extra === 'sweat'" class="mocca-sweat" d="M62 70c4 8 8 12 8 17a8 8 0 0 1-16 0c0-5 4-9 8-17z" :fill="BLUE" :stroke="LINE" stroke-width="3.500" stroke-linejoin="round" />

        <!-- ojos -->
        <g class="mocca-eyes">
          <!-- celebrando: ojitos cerrados de risa -->
          <g v-if="look.eyes === 'laugh'" fill="none" :stroke="LINE" stroke-width="5.500" stroke-linecap="round">
            <path d="M86 104q10-14 20 0M134 104q10-14 20 0" />
          </g>
          <!-- sorprendida: ojos blancos grandes con pupila pequeña -->
          <g v-else-if="look.eyes === 'white'">
            <ellipse cx="96" cy="100" rx="13" ry="15" fill="#fff" :stroke="LINE" stroke-width="4" />
            <ellipse cx="144" cy="100" rx="13" ry="15" fill="#fff" :stroke="LINE" stroke-width="4" />
            <circle cx="98" cy="102" r="6" :fill="LINE" />
            <circle cx="142" cy="102" r="6" :fill="LINE" />
            <circle cx="100" cy="100" r="1.800" fill="#fff" />
            <circle cx="144" cy="100" r="1.800" fill="#fff" />
          </g>
          <!-- asombrada (examen perfecto): ojos completamente blancos que brillan, con destellos -->
          <g v-else-if="look.eyes === 'glow'">
            <!-- dos estrellas blancas que brillan (sin contorno: son pura luz) -->
            <g class="mocca-glow" fill="#fff">
              <path class="mocca-star-eye" d="M96 76c2.600 15.400 8.600 21.400 24 24-15.400 2.600-21.400 8.600-24 24-2.600-15.400-8.600-21.400-24-24 15.400-2.600 21.400-8.600 24-24z" />
              <path class="mocca-star-eye" d="M144 76c2.600 15.400 8.600 21.400 24 24-15.400 2.600-21.400 8.600-24 24-2.600-15.400-8.600-21.400-24-24 15.400-2.600 21.400-8.600 24-24z" />
            </g>
          </g>
          <!-- orgullosa: gafas de sol -->
          <g v-else-if="look.eyes === 'shades'" class="mocca-shades">
            <path d="M74 96q46-8 92 0" fill="none" :stroke="LINE" stroke-width="5" stroke-linecap="round" />
            <path d="M76 92h38c2 0 3 2 3 4 0 12-8 20-20 20s-22-8-22-20c0-2 0-4 1-4z" :fill="LINE" />
            <path d="M126 92h38c1 0 1 2 1 4 0 12-10 20-22 20s-20-8-20-20c0-2 1-4 3-4z" :fill="LINE" />
            <path d="M84 97l10-2M134 97l10-2" fill="none" stroke="#fff" stroke-width="3.500" stroke-linecap="round" opacity="0.85" />
            <path class="mocca-glint" d="M88 112l14-18" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0" />
          </g>
          <!-- cerrados y tranquilos (dormida, aliviada, relajada, tímida, segura) -->
          <g v-else-if="look.eyes === 'closed'" fill="none" :stroke="LINE" stroke-width="5.500" stroke-linecap="round">
            <path d="M86 99q10 11 20 0M134 99q10 11 20 0" />
          </g>
          <!-- con estrellitas (emocionada, con ganas) -->
          <g v-else-if="look.eyes === 'stars'">
            <ellipse cx="96" cy="101" rx="12" ry="13.500" :fill="LINE" />
            <ellipse cx="144" cy="101" rx="12" ry="13.500" :fill="LINE" />
            <g fill="#fff" class="mocca-starglint">
              <path d="M97 90c1.200 7 3.800 9.600 10.500 10.800-6.700 1.200-9.300 3.800-10.500 10.800-1.200-7-3.800-9.600-10.500-10.800 6.700-1.200 9.300-3.800 10.500-10.800z" />
              <path d="M145 90c1.200 7 3.800 9.600 10.500 10.800-6.700 1.200-9.300 3.800-10.500 10.800-1.200-7-3.800-9.600-10.500-10.800 6.700-1.200 9.300-3.800 10.500-10.800z" />
            </g>
            <circle cx="90" cy="109" r="1.800" fill="#fff" />
            <circle cx="138" cy="109" r="1.800" fill="#fff" />
          </g>
          <!-- corazones (enamorada) -->
          <g v-else-if="look.eyes === 'hearts'" class="mocca-heart-eyes" :fill="PINK" :stroke="LINE" stroke-width="3.500" stroke-linejoin="round">
            <path d="M96 115c-14-9-17-17-14-22 3-6 11-5 14 1 3-6 11-7 14-1 3 5 0 13-14 22z" />
            <path d="M144 115c-14-9-17-17-14-22 3-6 11-5 14 1 3-6 11-7 14-1 3 5 0 13-14 22z" />
            <path d="M88 98q2-4 6-4M136 98q2-4 6-4" fill="none" stroke="#fff" stroke-width="2.500" stroke-linecap="round" />
          </g>
          <!-- de susto: muy abiertos y con la pupila chiquita -->
          <g v-else-if="look.eyes === 'scared'">
            <ellipse cx="96" cy="100" rx="15" ry="17" fill="#fff" :stroke="LINE" stroke-width="4" />
            <ellipse cx="144" cy="100" rx="15" ry="17" fill="#fff" :stroke="LINE" stroke-width="4" />
            <circle cx="97" cy="101" r="3.600" :fill="LINE" />
            <circle cx="143" cy="101" r="3.600" :fill="LINE" />
          </g>
          <!-- normales: grandes y brillantes -->
          <g v-else class="mocca-blink">
            <g :class="mood === 'thinking' && 'mocca-look-up'" :style="look.look ? { transform: gaze } : undefined">
              <ellipse cx="96" cy="101" rx="10" ry="12" :fill="LINE" />
              <ellipse cx="144" cy="101" rx="10" ry="12" :fill="LINE" />
              <circle cx="100" cy="96.500" r="3.800" fill="#fff" />
              <circle cx="148" cy="96.500" r="3.800" fill="#fff" />
              <circle cx="93" cy="106" r="1.800" fill="#fff" opacity="0.9" />
              <circle cx="141" cy="106" r="1.800" fill="#fff" opacity="0.9" />
            </g>
            <!-- triste: párpado caído y ojos aguados -->
            <!-- enojada: párpados en "V" -->
            <g v-if="look.lid === 'angry'">
              <path d="M82 90l29 11v-23h-29zM158 90l-29 11v-23h29z" :fill="COAT" />
              <path d="M83 90.500l27 10M157 90.500l-27 10" fill="none" :stroke="LINE" stroke-width="4" stroke-linecap="round" />
            </g>
            <!-- decidida: párpados firmes, apenas inclinados -->
            <g v-else-if="look.lid === 'firm'">
              <path d="M82 93l29 5v-20h-29zM158 93l-29 5v-20h29z" :fill="COAT" />
              <path d="M83 93.500l27 4.500M157 93.500l-27 4.500" fill="none" :stroke="LINE" stroke-width="4" stroke-linecap="round" />
            </g>
            <!-- aburrida: párpados a media asta -->
            <g v-else-if="look.lid === 'half'">
              <path d="M82 101h29v-23h-29zM129 101h29v-23h-29z" :fill="COAT" />
              <path d="M83.500 101h26M130.500 101h26" fill="none" :stroke="LINE" stroke-width="4" stroke-linecap="round" />
            </g>
            <g v-if="look.lid === 'sad'">
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
          <template v-if="look.mouth === 'smile' || look.mouth === 'drool'">
            <path d="M120 130v4" />
            <path d="M104 134q16 24 32 0z" :fill="LINE" />
            <path d="M112 145q8-7 16 0-2 7-8 7t-8-7z" :fill="EAR_IN" stroke="none" />
            <!-- con ganas: se le hace agua la boca -->
            <path v-if="look.mouth === 'drool'" d="M133 142c3 6 5 9 5 12a5 5 0 0 1-10 0c0-3 2-6 5-12z" :fill="BLUE" stroke-width="3" />
          </template>
          <template v-else-if="look.mouth === 'smirk'">
            <path d="M120 130v4" />
            <path d="M106 136q10 9 22 5 6-2 8-8" />
          </template>
          <template v-else-if="look.mouth === 'hmm'">
            <path d="M120 130v5" />
            <path d="M111 139q9 4 17-3" />
          </template>
          <template v-else-if="look.mouth === 'o'">
            <path d="M120 130v3" />
            <ellipse cx="120" cy="141" rx="6" ry="7.500" :fill="LINE" />
          </template>
          <template v-else-if="look.mouth === 'grin'">
            <path d="M120 130v3" />
            <path d="M100 134q20 30 40 0z" :fill="LINE" />
            <path d="M104 136h32l-3 5h-26z" fill="#fff" stroke="none" />
            <path d="M111 149q9-7 18 0-2 7-9 7t-9-7z" :fill="EAR_IN" stroke="none" />
          </template>
          <!-- enojada: dientes apretados -->
          <template v-else-if="look.mouth === 'gritted'">
            <path d="M120 130v4" />
            <path d="M105 137q15-5 30 0v8q-15 5-30 0z" fill="#fff" />
            <path d="M113 136v11M120 135v12M127 136v11" stroke-width="2.800" />
          </template>
          <!-- adormilada: bostezo -->
          <template v-else-if="look.mouth === 'yawn'">
            <path d="M120 130v3" />
            <ellipse cx="120" cy="144" rx="9" ry="11" :fill="LINE" />
            <ellipse cx="120" cy="150" rx="5.500" ry="4" :fill="EAR_IN" stroke="none" />
          </template>
          <!-- nerviosa: boquita temblorosa -->
          <template v-else-if="look.mouth === 'wavy'">
            <path d="M120 130v5" />
            <path d="M105 141q4-5 7.500 0t7.500 0 7.500 0 7.500 0" />
          </template>
          <!-- confundida: de lado -->
          <template v-else-if="look.mouth === 'slant'">
            <path d="M120 130v5" />
            <path d="M110 144l18-6" />
          </template>
          <!-- sonrisita cerrada -->
          <template v-else-if="look.mouth === 'cat' || look.mouth === 'tongue'">
            <path d="M120 130v5" />
            <path d="M107 137q6.500 8 13 0q6.500 8 13 0" />
            <!-- hambrienta: lengua afuera -->
            <path v-if="look.mouth === 'tongue'" d="M113 141c0 12 3 18 7 18s7-6 7-18z" :fill="EAR_IN" stroke-width="3.500" />
            <path v-if="look.mouth === 'tongue'" d="M120 144v9" stroke-width="2.500" opacity="0.5" />
          </template>
          <!-- tímida / ansiosa: la tapan las patitas -->
          <template v-else-if="look.mouth === 'none'">
            <path d="M120 130v4" />
          </template>
          <!-- aliviada: soplido -->
          <template v-else-if="look.mouth === 'puff'">
            <path d="M120 130v4" />
            <ellipse cx="125" cy="141" rx="4.500" ry="5" :fill="LINE" />
          </template>
          <!-- aburrida: recta -->
          <template v-else-if="look.mouth === 'flat'">
            <path d="M120 130v5" />
            <path d="M110 142h20" />
          </template>
          <!-- miedosa: grito tembloroso -->
          <template v-else-if="look.mouth === 'scream'">
            <path d="M120 130v3" />
            <path d="M105 139q5-5 10 0t10 0 10 0v7q-7 9-15 9t-15-9z" :fill="LINE" />
            <ellipse cx="120" cy="150" rx="6" ry="3.500" :fill="EAR_IN" stroke="none" />
          </template>
          <!-- sorpresa feliz: boca abierta y redonda, sonriendo -->
          <template v-else-if="look.mouth === 'smileO'">
            <path d="M120 130v3" />
            <path d="M108 136q12-4 24 0 0 16-12 16t-12-16z" :fill="LINE" />
            <ellipse cx="120" cy="148" rx="6" ry="3.500" :fill="EAR_IN" stroke="none" />
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
        <!-- curiosa: la lupa, que queda justo sobre el ojo -->
        <g v-if="look.extra === 'lens'" stroke-linecap="round">
          <path d="M164 212l-3 18" fill="none" :stroke="LINE" stroke-width="10" />
          <path d="M164 212l-3 18" fill="none" :stroke="GOLD_DEEP" stroke-width="5" />
          <circle cx="160" cy="249" r="19" fill="#EAF6FF" :stroke="LINE" stroke-width="9" />
          <circle cx="160" cy="249" r="19" fill="none" :stroke="GOLD" stroke-width="4.500" />
          <circle cx="160" cy="249" r="11" :fill="LINE" />
          <circle cx="156" cy="253.500" r="3.600" fill="#fff" />
          <path d="M172 240q3 5 3 10" fill="none" stroke="#fff" stroke-width="3" opacity="0.9" />
        </g>
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
.mocca-star-eye {
  transform-box: fill-box;
  transform-origin: center;
  animation: star-eye 1.100s ease-in-out infinite;
}
.mocca-star-eye:nth-child(2) {
  animation-delay: 0.180s;
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

/* ═══ Piezas de los ánimos nuevos ═══ */
.mocca-tail-fast .mocca-tail {
  animation-duration: 0.220s;
}
.mocca-tail-slow .mocca-tail {
  animation-duration: 1.700s;
}
.mocca-tail-still .mocca-tail {
  animation: none;
}
.mocca-tail-down .mocca-tail {
  animation: none;
  transform: rotate(46deg);
}
.mocca-anim-bounce .mocca-all {
  animation: hop-small 0.560s cubic-bezier(0.3, 0, 0.4, 1) infinite;
}
.mocca-anim-tremble .mocca-all {
  animation: tremble 0.140s linear infinite;
}
.mocca-anim-sway .mocca-all {
  animation: sway 2.600s ease-in-out infinite;
}
.mocca-anim-nod .mocca-head {
  animation: nod-sleep 3.400s ease-in-out infinite;
}
.mocca-anim-nod .mocca-body {
  animation-duration: 4.400s;
}
.mocca-anim-shake .mocca-all {
  animation: shake-x 0.280s linear infinite;
}
.mocca-anim-pump .mocca-all {
  animation: hop-small 0.900s cubic-bezier(0.3, 0, 0.4, 1) infinite;
}
.mocca-anim-pump .mocca-arm--l {
  animation: cheer-l 0.450s ease-in-out infinite alternate;
}
.mocca-pulse {
  animation: pulse 0.700s ease-in-out infinite alternate;
  transform-origin: 204px 56px;
}
.mocca-hearts path {
  transform-box: fill-box;
  transform-origin: center;
  animation: heart-float 1.800s ease-in-out infinite;
}
.mocca-hearts path:nth-child(2) {
  animation-delay: 0.500s;
}
.mocca-hearts path:nth-child(3) {
  animation-delay: 1s;
}
.mocca-heart-eyes {
  transform-origin: 120px 104px;
  animation: heart-beat 0.800s ease-in-out infinite;
}
.mocca-puff {
  transform-origin: 172px 152px;
  animation: puff-out 2.400s ease-out infinite;
}
.mocca-sweat {
  animation: tear 2.200s ease-in infinite;
}

/* ═══ Acciones de cuerpo entero: mandan sobre las animaciones del ánimo ═══ */
.mocca-foot--l {
  transform-origin: 93px 238px;
}
.mocca-foot--r {
  transform-origin: 147px 238px;
}

/* ── correr (hacia la derecha): inclinada, rebota aplastándose, orejas y cola hacia atrás, patas revueltas ── */
.mocca.mocca--act-run .mocca-all {
  animation: run-body 0.220s linear infinite;
}
.mocca.mocca--act-run .mocca-body,
.mocca.mocca--act-run .mocca-collar {
  animation: none;
}
.mocca.mocca--act-run .mocca-head {
  animation: run-head 0.220s linear infinite;
}
.mocca.mocca--act-run .mocca-ear--l {
  animation: run-ear-l 0.220s ease-in-out infinite;
}
.mocca.mocca--act-run .mocca-ear--r {
  animation: run-ear-r 0.220s ease-in-out infinite;
}
.mocca.mocca--act-run .mocca-tail {
  animation: run-tail 0.220s ease-in-out infinite;
}
.mocca.mocca--act-run .mocca-foot--l {
  animation: run-foot 0.220s linear infinite;
}
.mocca.mocca--act-run .mocca-foot--r {
  animation: run-foot 0.220s linear infinite -0.110s;
}
.mocca.mocca--act-run .mocca-arm--l {
  animation: run-arm-l 0.220s ease-in-out infinite;
}
.mocca.mocca--act-run .mocca-arm--r {
  animation: run-arm-r 0.220s ease-in-out infinite;
}
.mocca.mocca--act-run .mocca-shadow {
  animation: run-shadow 0.220s linear infinite;
  transform-origin: 120px 248px;
}

/* ── resbalón: frena echada hacia atrás, las patas se le van adelante y termina de espaldas ── */
.mocca.mocca--act-slip .mocca-all {
  animation: slip-body 0.900s cubic-bezier(0.3, 0.6, 0.4, 1) both;
}
.mocca.mocca--act-slip .mocca-body,
.mocca.mocca--act-slip .mocca-head,
.mocca.mocca--act-slip .mocca-collar {
  animation: none;
}
.mocca.mocca--act-slip .mocca-ear--l,
.mocca.mocca--act-slip .mocca-ear--r {
  animation: slip-ear 0.900s ease-out both;
}
.mocca.mocca--act-slip .mocca-foot--l {
  animation: slip-foot 0.160s linear infinite;
}
.mocca.mocca--act-slip .mocca-foot--r {
  animation: slip-foot 0.160s linear infinite -0.080s;
}
.mocca.mocca--act-slip .mocca-arm--l {
  animation: flail-l 0.180s linear infinite;
}
.mocca.mocca--act-slip .mocca-arm--r {
  animation: flail-r 0.180s linear infinite;
}
.mocca.mocca--act-slip .mocca-tail {
  animation: none;
  transform: rotate(-50deg) scale(1.150, 0.900);
}

/* ── caminar de vuelta: se balancea de un lado a otro, medio apenada ── */
.mocca.mocca--act-waddle .mocca-all {
  animation: waddle 0.360s ease-in-out infinite;
}
.mocca.mocca--act-waddle .mocca-foot--l {
  animation: step 0.360s ease-in-out infinite;
}
.mocca.mocca--act-waddle .mocca-foot--r {
  animation: step 0.360s ease-in-out infinite -0.180s;
}
.mocca.mocca--act-waddle .mocca-ear--l {
  animation: none;
  transform: rotate(-20deg) skewX(8deg);
}
.mocca.mocca--act-waddle .mocca-ear--r {
  animation: none;
  transform: rotate(20deg) skewX(-8deg);
}
.mocca.mocca--act-waddle .mocca-tail {
  animation: wag 0.900s ease-in-out infinite alternate;
}

/* ── agacharse: se aplasta para tomar impulso ── */
.mocca.mocca--act-crouch .mocca-all {
  animation: crouch 0.260s cubic-bezier(0.3, 0, 0.2, 1) both;
}
.mocca.mocca--act-crouch .mocca-ear--l {
  animation: none;
  transform: rotate(-26deg);
  transition: transform 0.200s;
}
.mocca.mocca--act-crouch .mocca-ear--r {
  animation: none;
  transform: rotate(26deg);
  transition: transform 0.200s;
}

/* ── saltar de emoción: estirón al subir, aplastón al caer, orejas y brazos con rebote ── */
.mocca.mocca--act-jump .mocca-all {
  animation: jump 0.640s cubic-bezier(0.3, 0, 0.3, 1) infinite;
}
.mocca.mocca--act-jump .mocca-shadow {
  animation: jump-shadow 0.640s cubic-bezier(0.3, 0, 0.3, 1) infinite;
  transform-origin: 120px 248px;
}
.mocca.mocca--act-jump .mocca-body,
.mocca.mocca--act-jump .mocca-collar {
  animation: none;
}
.mocca.mocca--act-jump .mocca-head {
  animation: jump-head 0.640s cubic-bezier(0.3, 0, 0.3, 1) infinite;
}
.mocca.mocca--act-jump .mocca-ear--l {
  animation: jump-ear-l 0.640s ease-in-out infinite;
}
.mocca.mocca--act-jump .mocca-ear--r {
  animation: jump-ear-r 0.640s ease-in-out infinite;
}
.mocca.mocca--act-jump .mocca-foot--l {
  animation: jump-foot-l 0.640s ease-in-out infinite;
}
.mocca.mocca--act-jump .mocca-foot--r {
  animation: jump-foot-r 0.640s ease-in-out infinite;
}
.mocca.mocca--act-jump .mocca-tail {
  animation: wag 0.160s ease-in-out infinite alternate;
}

@keyframes run-body {
  0%,
  100% {
    transform: skewX(-17deg) translateY(0) scale(1.080, 0.900);
  }
  50% {
    transform: skewX(-21deg) translateY(-13px) scale(0.960, 1.060);
  }
}
@keyframes run-head {
  0%,
  100% {
    transform: translate(8px, 4px) rotate(7deg);
  }
  50% {
    transform: translate(10px, -3px) rotate(4deg);
  }
}
@keyframes run-ear-l {
  0%,
  100% {
    transform: rotate(-34deg) skewX(16deg) scaleY(0.940);
  }
  50% {
    transform: rotate(-44deg) skewX(22deg) scaleY(1.060);
  }
}
@keyframes run-ear-r {
  0%,
  100% {
    transform: rotate(-22deg) skewX(16deg) scaleY(0.940);
  }
  50% {
    transform: rotate(-32deg) skewX(22deg) scaleY(1.060);
  }
}
@keyframes run-tail {
  0%,
  100% {
    transform: rotate(-78deg) scale(1.250, 0.850);
  }
  50% {
    transform: rotate(-64deg) scale(1.150, 0.900);
  }
}
@keyframes run-foot {
  0% {
    transform: translate(26px, -4px) rotate(-30deg);
  }
  25% {
    transform: translate(0, 2px) rotate(0) scaleX(1.150);
  }
  50% {
    transform: translate(-30px, -6px) rotate(38deg);
  }
  75% {
    transform: translate(-6px, -24px) rotate(10deg) scaleX(0.900);
  }
  100% {
    transform: translate(26px, -4px) rotate(-30deg);
  }
}
@keyframes run-arm-l {
  0%,
  100% {
    transform: rotate(74deg);
  }
  50% {
    transform: rotate(-44deg);
  }
}
@keyframes run-arm-r {
  0%,
  100% {
    transform: rotate(40deg);
  }
  50% {
    transform: rotate(-72deg);
  }
}
@keyframes run-shadow {
  50% {
    transform: scaleX(0.800);
    opacity: 0.080;
  }
}
@keyframes slip-body {
  0% {
    transform: skewX(-17deg) scale(1.080, 0.900);
  }
  14% {
    transform: skewX(24deg) rotate(8deg) scale(0.900, 1.100);
  }
  45% {
    transform: skewX(18deg) rotate(28deg) scale(1.040, 0.960) translateY(4px);
  }
  100% {
    transform: skewX(6deg) rotate(84deg) scale(1.100, 0.900) translate(10px, 30px);
  }
}
@keyframes slip-ear {
  0% {
    transform: rotate(-36deg) skewX(18deg);
  }
  20% {
    transform: rotate(26deg) skewX(-16deg);
  }
  100% {
    transform: rotate(14deg) skewX(-8deg);
  }
}
@keyframes slip-foot {
  0%,
  100% {
    transform: translate(22px, -10px) rotate(-36deg);
  }
  50% {
    transform: translate(6px, -22px) rotate(-12deg);
  }
}
@keyframes flail-l {
  0%,
  100% {
    transform: rotate(150deg);
  }
  50% {
    transform: rotate(70deg);
  }
}
@keyframes flail-r {
  0%,
  100% {
    transform: rotate(-70deg);
  }
  50% {
    transform: rotate(-150deg);
  }
}
@keyframes waddle {
  0%,
  100% {
    transform: rotate(-7deg) skewX(5deg) scale(1.030, 0.970);
  }
  25% {
    transform: rotate(0) translateY(-5px) scale(0.980, 1.030);
  }
  50% {
    transform: rotate(7deg) skewX(-1deg) scale(1.030, 0.970);
  }
  75% {
    transform: rotate(0) translateY(-5px) scale(0.980, 1.030);
  }
}
@keyframes step {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-8px, -10px) rotate(12deg);
  }
}
@keyframes crouch {
  to {
    transform: scale(1.220, 0.740);
  }
}
@keyframes jump {
  0% {
    transform: translateY(0) scale(1.240, 0.740);
  }
  18% {
    transform: translateY(-18px) scale(0.820, 1.260);
  }
  45% {
    transform: translateY(-74px) scale(0.960, 1.060) rotate(-4deg);
  }
  55% {
    transform: translateY(-76px) scale(1.020, 0.990) rotate(3deg);
  }
  82% {
    transform: translateY(-12px) scale(0.860, 1.200);
  }
  92% {
    transform: translateY(0) scale(1.280, 0.720);
  }
  100% {
    transform: translateY(0) scale(1.240, 0.740);
  }
}
@keyframes jump-shadow {
  0%,
  100% {
    transform: scaleX(1.200);
    opacity: 0.180;
  }
  50% {
    transform: scaleX(0.550);
    opacity: 0.060;
  }
}
@keyframes jump-head {
  0%,
  100% {
    transform: translateY(9px);
  }
  20% {
    transform: translateY(-5px);
  }
  50% {
    transform: translateY(-3px) rotate(-3deg);
  }
  85% {
    transform: translateY(-7px);
  }
}
@keyframes jump-ear-l {
  0%,
  100% {
    transform: rotate(-24deg);
  }
  25% {
    transform: rotate(20deg) scaleY(1.120);
  }
  55% {
    transform: rotate(-6deg);
  }
  85% {
    transform: rotate(14deg) scaleY(1.100);
  }
}
@keyframes jump-ear-r {
  0%,
  100% {
    transform: rotate(24deg);
  }
  25% {
    transform: rotate(-20deg) scaleY(1.120);
  }
  55% {
    transform: rotate(6deg);
  }
  85% {
    transform: rotate(-14deg) scaleY(1.100);
  }
}
@keyframes jump-foot-l {
  0%,
  100% {
    transform: none;
  }
  45% {
    transform: translate(-12px, 10px) rotate(24deg);
  }
}
@keyframes jump-foot-r {
  0%,
  100% {
    transform: none;
  }
  45% {
    transform: translate(12px, 10px) rotate(-24deg);
  }
}

@keyframes hop-small {
  0%,
  100% {
    transform: translateY(0) scale(1.050, 0.950);
  }
  45% {
    transform: translateY(-10px) scale(0.970, 1.040);
  }
}
@keyframes sway {
  0%,
  100% {
    transform: rotate(-3deg);
  }
  50% {
    transform: rotate(3deg);
  }
}
@keyframes nod-sleep {
  0%,
  100% {
    transform: translateY(0) rotate(0);
  }
  55% {
    transform: translateY(8px) rotate(5deg);
  }
  70% {
    transform: translateY(9px) rotate(6deg);
  }
  80% {
    transform: translateY(1px) rotate(-1deg);
  }
}
@keyframes shake-x {
  0%,
  100% {
    transform: translateX(-2px);
  }
  50% {
    transform: translateX(2px);
  }
}
@keyframes pulse {
  from {
    transform: scale(0.880);
    opacity: 0.750;
  }
  to {
    transform: scale(1.080);
    opacity: 1;
  }
}
@keyframes heart-float {
  0% {
    transform: translateY(8px) scale(0.600);
    opacity: 0;
  }
  35% {
    opacity: 1;
  }
  100% {
    transform: translateY(-16px) scale(1.100);
    opacity: 0;
  }
}
@keyframes heart-beat {
  50% {
    transform: scale(1.100);
  }
}
@keyframes puff-out {
  0%,
  35% {
    transform: scale(0.200);
    opacity: 0;
  }
  55% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(16px, -6px) scale(1.200);
    opacity: 0;
  }
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
    filter: drop-shadow(0 0 4px #fff) drop-shadow(0 0 10px #ffe58a) drop-shadow(0 0 18px #ffc93c);
  }
  50% {
    filter: drop-shadow(0 0 8px #fff) drop-shadow(0 0 22px #ffd23f) drop-shadow(0 0 38px #ffb300);
  }
}
@keyframes star-eye {
  50% {
    transform: scale(1.140) rotate(8deg);
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
