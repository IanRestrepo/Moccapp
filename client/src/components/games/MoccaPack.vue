<script setup lang="ts">
/** Sobre de Moccas: papel morado con la huellita y la M, borde dentado arriba. Brilla si hay para abrir. */
defineProps<{ size?: number; shine?: boolean }>()
</script>

<template>
  <svg :width="size ?? 80" :height="(size ?? 80) * 1.3" viewBox="0 0 100 130" :class="['pack', shine && 'pack--shine']" aria-hidden="true">
    <defs>
      <linearGradient id="pack-paper" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#c3aefc" />
        <stop offset="0.55" stop-color="#9a7bf0" />
        <stop offset="1" stop-color="#7656d9" />
      </linearGradient>
      <linearGradient id="pack-gloss" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0" />
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.55" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <clipPath id="pack-shape"><path d="M10 14l6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6v104a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8z" /></clipPath>
    </defs>
    <g clip-path="url(#pack-shape)">
      <rect width="100" height="130" fill="url(#pack-paper)" />
      <rect y="20" width="100" height="10" fill="#fff" opacity="0.18" />
      <rect y="104" width="100" height="6" fill="#2a1810" opacity="0.15" />
      <rect class="pack-gloss" x="-60" y="0" width="40" height="130" fill="url(#pack-gloss)" transform="skewX(-18)" />
    </g>
    <path
      d="M10 14l6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6v104a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8z"
      fill="none"
      stroke="#2a1810"
      stroke-width="4"
      stroke-linejoin="round"
    />
    <!-- medalla con la M -->
    <circle cx="50" cy="66" r="22" fill="#ffcf3f" stroke="#2a1810" stroke-width="4" />
    <path d="M40 76V56l10 12 10-12v20" fill="none" stroke="#2a1810" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    <!-- huellitas -->
    <g fill="#fff" opacity="0.85">
      <ellipse cx="26" cy="100" rx="5" ry="4" />
      <circle cx="21" cy="94" r="2" />
      <circle cx="26" cy="92" r="2" />
      <circle cx="31" cy="94" r="2" />
      <ellipse cx="76" cy="38" rx="4" ry="3.300" />
      <circle cx="72" cy="33" r="1.700" />
      <circle cx="76" cy="31" r="1.700" />
      <circle cx="80" cy="33" r="1.700" />
    </g>
  </svg>
</template>

<style scoped>
.pack {
  overflow: visible;
  filter: drop-shadow(0 6px 0 rgba(42, 24, 16, 0.25));
}
.pack--shine {
  animation: pack-float 2.400s ease-in-out infinite;
  filter: drop-shadow(0 6px 0 rgba(42, 24, 16, 0.25)) drop-shadow(0 0 16px rgba(255, 207, 63, 0.550));
}
.pack--shine .pack-gloss {
  animation: gloss 2.400s ease-in-out infinite;
}
@keyframes pack-float {
  50% {
    transform: translateY(-5px) rotate(-3deg);
  }
}
@keyframes gloss {
  0%,
  40% {
    transform: skewX(-18deg) translateX(0);
  }
  80%,
  100% {
    transform: skewX(-18deg) translateX(200px);
  }
}
</style>
