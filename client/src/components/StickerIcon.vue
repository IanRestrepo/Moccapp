<script setup lang="ts">
/**
 * Stickers decorativos con contorno grueso: van dentro de frases (estilo "Today") o sueltos
 * como decoración. Son ilustraciones, no íconos de interfaz (para eso, Phosphor).
 */
export type StickerName =
  | 'bone' | 'paw' | 'capsule' | 'flame' | 'star' | 'heart'
  // premios
  | 'icecream' | 'coffee' | 'cake' | 'ticket' | 'dinner' | 'spa' | 'mountain' | 'plane' | 'gift'

withDefaults(defineProps<{ name: StickerName; size?: number; tilt?: number }>(), { size: 32, tilt: 0 })
const INK = '#16141C'
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    aria-hidden="true"
    class="vq-sticker inline-block shrink-0 overflow-visible align-[-0.12em]"
    :style="{ transform: `rotate(${tilt}deg)` }"
  >
    <g :stroke="INK" stroke-linejoin="round" stroke-linecap="round">
      <template v-if="name === 'bone'">
        <!-- unión: primero todo con trazo grueso, luego el relleno encima -->
        <g transform="rotate(-24 24 24)" stroke-width="7">
          <circle cx="10" cy="19" r="6" /><circle cx="10" cy="29" r="6" />
          <circle cx="38" cy="19" r="6" /><circle cx="38" cy="29" r="6" />
          <rect x="10" y="19" width="28" height="10" />
        </g>
        <g transform="rotate(-24 24 24)" fill="#FFF6E4" stroke="none">
          <circle cx="10" cy="19" r="6" /><circle cx="10" cy="29" r="6" />
          <circle cx="38" cy="19" r="6" /><circle cx="38" cy="29" r="6" />
          <rect x="10" y="19" width="28" height="10" />
        </g>
      </template>

      <template v-else-if="name === 'paw'">
        <g fill="var(--vq-pink)" stroke-width="3">
          <path d="M24 24c6 0 12 6 12 11 0 4-4 6-7 5-2-.6-3-1.5-5-1.5S21 39.4 19 40c-3 1-7-1-7-5 0-5 6-11 12-11z" />
          <ellipse cx="11" cy="20" rx="4.5" ry="5.5" transform="rotate(-20 11 20)" />
          <ellipse cx="19" cy="11.5" rx="4.5" ry="5.8" transform="rotate(-8 19 11.5)" />
          <ellipse cx="29" cy="11.5" rx="4.5" ry="5.8" transform="rotate(8 29 11.5)" />
          <ellipse cx="37" cy="20" rx="4.5" ry="5.5" transform="rotate(20 37 20)" />
        </g>
      </template>

      <template v-else-if="name === 'capsule'">
        <g transform="rotate(-38 24 24)" stroke-width="3">
          <path d="M24 15H15a9 9 0 0 0 0 18h9z" fill="var(--vq-pink)" />
          <path d="M24 15h9a9 9 0 0 1 0 18h-9z" fill="#fff" />
          <path d="M11 20q2-3 6-3" fill="none" stroke="#fff" stroke-width="2.5" />
        </g>
      </template>

      <template v-else-if="name === 'flame'">
        <path
          d="M24 4c2 8 13 13 13 26a13 13 0 0 1-26 0c0-7 4-11 7-14 0 5 2 7 4.5 7C22.5 15 20 9 24 4z"
          fill="var(--vq-orange)"
          stroke-width="3"
        />
        <path d="M24 26c2.5 4 6 6 6 10a6 6 0 0 1-12 0c0-4 3-6 6-10z" fill="var(--vq-yellow)" stroke-width="2.5" />
      </template>

      <template v-else-if="name === 'star'">
        <path d="M24 3c2 13 8 19 21 21-13 2-19 8-21 21-2-13-8-19-21-21 13-2 19-8 21-21z" fill="var(--vq-yellow)" stroke-width="3" />
      </template>

      <!-- ── premios ── -->
      <template v-else-if="name === 'icecream'">
        <path d="M14 22h20l-10 21z" fill="#E8B266" stroke-width="3" />
        <path d="M18 27l9 6M16 23l14 9" fill="none" stroke-width="2" opacity="0.5" />
        <circle cx="24" cy="17" r="10" fill="var(--vq-pink)" stroke-width="3" />
        <path d="M17 13q3-4 7-4" fill="none" stroke="#fff" stroke-width="2.5" />
        <circle cx="25" cy="5.5" r="3.5" fill="#F2554B" stroke-width="2.5" />
      </template>

      <template v-else-if="name === 'coffee'">
        <path d="M17 6q2 3 0 6M24 5q2 3 0 6M31 6q2 3 0 6" fill="none" stroke-width="2.5" />
        <path d="M32 21h3a5.5 5.5 0 0 1 0 11h-3" fill="none" stroke-width="3" />
        <path d="M9 17h24v14a9 9 0 0 1-9 9h-6a9 9 0 0 1-9-9z" fill="#fff" stroke-width="3" />
        <path d="M9 23h24" stroke-width="2.5" />
        <ellipse cx="21" cy="45" rx="15" ry="2" fill="var(--vq-surface-2)" stroke="none" />
      </template>

      <template v-else-if="name === 'cake'">
        <rect x="22.5" y="9" width="4" height="10" rx="1.5" fill="var(--vq-yellow)" stroke-width="2.5" />
        <path d="M24.5 3c2 2.5 2.5 4 0 6-2.5-2-2-3.5 0-6z" fill="var(--vq-orange)" stroke-width="2" />
        <path d="M7 24h35v15a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z" fill="var(--vq-pink)" stroke-width="3" />
        <path d="M7 24a4 4 0 0 1 4-5h27a4 4 0 0 1 4 5q-3 5-6 0-3 5-6 0-3 5-6 0-3 5-6 0-3 5-6 0-3 5-5.5 0z" fill="#fff" stroke-width="3" />
      </template>

      <template v-else-if="name === 'ticket'">
        <g transform="rotate(-12 24 24)">
          <path d="M5 14h38v6a4 4 0 0 0 0 8v6H5v-6a4 4 0 0 0 0-8z" fill="var(--vq-yellow)" stroke-width="3" />
          <path d="M33 15v18" stroke-width="2.5" stroke-dasharray="3 3" />
          <path d="M19 19l1.6 3.4 3.7.4-2.8 2.5.8 3.7-3.3-1.9-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z" fill="#fff" stroke-width="2" />
        </g>
      </template>

      <template v-else-if="name === 'dinner'">
        <path d="M6 8v10a3 3 0 0 0 3 3v19M9 8v8M12 8v10a3 3 0 0 1-3 3" fill="none" stroke-width="2.5" />
        <path d="M40 40V8c-4 2-5 8-5 14h5" fill="#DCE3EE" stroke-width="2.5" />
        <circle cx="24" cy="25" r="11.5" fill="#fff" stroke-width="3" />
        <circle cx="24" cy="25" r="6.5" fill="var(--vq-orange)" stroke-width="2.5" />
      </template>

      <template v-else-if="name === 'spa'">
        <path d="M24 40C15 40 6 34 4 24c6-1 13 2 18 9M24 40c9 0 18-6 20-16-6-1-13 2-18 9" fill="var(--vq-mint)" stroke-width="3" />
        <path d="M24 40C14 34 12 22 16 14c5 3 8 9 8 16 0-7 3-13 8-16 4 8 2 20-8 26z" fill="var(--vq-pink)" stroke-width="3" />
      </template>

      <template v-else-if="name === 'mountain'">
        <circle cx="36" cy="11" r="6" fill="var(--vq-yellow)" stroke-width="2.5" />
        <path d="M3 41L18 15l9 15 5-7 13 18z" fill="var(--vq-mint)" stroke-width="3" />
        <path d="M13 23.5L18 15l5 8.5-3 2-2-2.5-2 2.5z" fill="#fff" stroke-width="2.5" />
      </template>

      <template v-else-if="name === 'plane'">
        <g transform="rotate(-30 24 24)">
          <path d="M21 4c1.6-1.6 4.4-1.6 6 0 1 1 1 2.5 1 4v8l15 9v5l-15-4v9l5 4v4l-9-2-9 2v-4l5-4v-9L5 30v-5l15-9V8c0-1.5 0-3 1-4z" fill="var(--vq-sky)" stroke-width="3" />
          <path d="M22 9h4" stroke="#fff" stroke-width="2.5" />
        </g>
      </template>

      <template v-else-if="name === 'gift'">
        <rect x="7" y="20" width="34" height="22" rx="3" fill="var(--vq-lilac)" stroke-width="3" />
        <rect x="4" y="14" width="40" height="8" rx="2.5" fill="var(--vq-pink)" stroke-width="3" />
        <path d="M24 14v28" stroke-width="3" />
        <path d="M24 14c-3-6-12-8-12-3s9 3 12 3zM24 14c3-6 12-8 12-3s-9 3-12 3z" fill="var(--vq-yellow)" stroke-width="2.5" />
      </template>

      <template v-else-if="name === 'heart'">
        <path d="M24 41S6 30 6 17a9 9 0 0 1 18-3 9 9 0 0 1 18 3c0 13-18 24-18 24z" fill="var(--vq-pink)" stroke-width="3" />
      </template>
    </g>
  </svg>
</template>

<style scoped>
/* borde blanco "troquelado" de sticker: se ve en fondo claro y oscuro */
.vq-sticker {
  filter: drop-shadow(1.5px 0 0 #fff) drop-shadow(-1.5px 0 0 #fff) drop-shadow(0 1.5px 0 #fff) drop-shadow(0 -1.5px 0 #fff)
    drop-shadow(0 2px 2px rgb(0 0 0 / 0.15));
}
</style>
