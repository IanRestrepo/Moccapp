<script setup lang="ts">
import { MOCCA_INFO, MOCCA_RARITY_LABEL, type MoccaMood } from '@vetquiz/shared'
import MascotBlob from '@/components/mascot/MascotBlob.vue'

/**
 * Carta de colección de una Mocca. Normal: fondo crema. Especial: lila con brillo. Legendaria: dorada con rayos.
 * Sin conseguir: silueta y "?".
 */
const props = defineProps<{ mood: MoccaMood; owned?: boolean; count?: number; isNew?: boolean; size?: 'sm' | 'lg' }>()
const info = MOCCA_INFO[props.mood]
</script>

<template>
  <div
    :class="[
      'card relative flex flex-col items-center overflow-hidden rounded-[18px] border-[3px] border-[#2a1810]',
      owned ? `card--${info.rarity}` : 'card--locked',
      size === 'lg' ? 'w-[148px] px-2 pb-2 pt-3' : 'w-full px-1 pb-1.5 pt-2',
    ]"
  >
    <span v-if="owned && info.rarity === 'legendary'" class="card-rays" aria-hidden="true" />
    <span v-if="owned && info.rarity !== 'normal'" class="card-gloss" aria-hidden="true" />
    <span
      v-if="owned"
      :class="[
        'relative z-[1] self-start rounded-full px-1.5 py-px font-extrabold uppercase tracking-wide',
        size === 'lg' ? 'text-[10.5px]' : 'text-[8.5px]',
        info.rarity === 'legendary' ? 'bg-[#2a1810] text-[#ffcf3f]' : info.rarity === 'special' ? 'bg-[#2a1810] text-[#c9b6ff]' : 'bg-[#2a1810]/10 text-[#2a1810]/70',
      ]"
    >
      {{ MOCCA_RARITY_LABEL[info.rarity] }}
    </span>
    <span v-if="isNew" class="absolute right-1.5 top-1.5 z-[2] rounded-full bg-pink px-1.5 py-px text-[10px] font-extrabold text-white">¡Nueva!</span>
    <span v-else-if="owned && (count ?? 1) > 1" class="absolute right-1.5 top-1.5 z-[2] rounded-full bg-[#2a1810] px-1.5 py-px text-[10px] font-extrabold text-white">×{{ count }}</span>
    <div :class="['relative z-[1]', !owned && 'card-silhouette']">
      <MascotBlob :mood="mood" :size="size === 'lg' ? 112 : 64" />
    </div>
    <p
      :class="[
        'relative z-[1] mt-0.5 text-center font-display font-extrabold leading-tight text-[#2a1810]',
        size === 'lg' ? 'text-[15px]' : 'text-[11.5px]',
      ]"
    >
      {{ owned ? info.label : '???' }}
    </p>
  </div>
</template>

<style scoped>
.card--normal {
  background: linear-gradient(180deg, #fff8ee, #f3e3cf);
}
.card--special {
  background: linear-gradient(160deg, #efe6ff 0%, #c9b6ff 55%, #ab90f7 100%);
}
.card--legendary {
  background: linear-gradient(160deg, #fff6c9 0%, #ffd766 45%, #f5a623 100%);
  box-shadow:
    0 0 0 2px #fff6c9 inset,
    0 0 18px rgba(255, 190, 40, 0.650);
}
.card--locked {
  background: #2a2633;
  border-color: #3b3546;
}
.card--locked p {
  color: #8b8496;
}
.card-silhouette {
  filter: brightness(0) invert(0.32);
  opacity: 0.55;
}
.card-rays {
  position: absolute;
  inset: -40%;
  background: repeating-conic-gradient(from 0deg, rgba(255, 255, 255, 0.450) 0deg 8deg, transparent 8deg 22deg);
  animation: rays 9s linear infinite;
}
.card-gloss {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -60%;
  width: 40%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.650), transparent);
  transform: skewX(-18deg);
  animation: card-gloss 3.200s ease-in-out infinite;
}
@keyframes rays {
  to {
    rotate: 360deg;
  }
}
@keyframes card-gloss {
  0%,
  55% {
    left: -60%;
  }
  100% {
    left: 140%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .card-rays,
  .card-gloss {
    animation: none;
  }
}
</style>
