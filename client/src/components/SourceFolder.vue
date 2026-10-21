<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import { PhFilePdf, PhFilePpt, PhImage, PhTextAa, PhYoutubeLogo, PhFileDoc, PhArrowsClockwise } from '@phosphor-icons/vue'
import type { SourceColor, SourceDTO } from '@vetquiz/shared'
import { pressable } from '@/lib/motion'

/** Fuente como carpeta (referencia "Saved"): lo que hay adentro asoma por detrás. */
const props = defineProps<{ source: SourceDTO }>()

const icon = computed(
  () => ({ pdf: PhFilePdf, pptx: PhFilePpt, docx: PhFileDoc, image: PhImage, text: PhTextAa, youtube: PhYoutubeLogo })[props.source.format],
)
// Tono trasero elegido a mano por color (mezclar con negro ensucia el amarillo)
const BACK: Record<SourceColor, string> = {
  yellow: '#f2b31f',
  orange: '#f07b26',
  lilac: '#8d6ce6',
  pink: '#ee5fa8',
  mint: '#35b673',
  sky: '#5a95ef',
}
const back = computed(() => BACK[props.source.color])
const front = computed(() => `var(--vq-${props.source.color})`)
const processing = computed(() => props.source.status === 'processing')
const failed = computed(() => props.source.status === 'error')
// en el texto extraído de PPTX sobran las marcas "Diapositiva N:"
const excerpt = computed(() => props.source.excerpt?.replace(/Diapositiva \d+:\s*/g, '') ?? '')
</script>

<template>
  <motion.button v-bind="pressable" class="group relative block h-[176px] w-full text-left text-on-color" type="button">
    <!-- parte trasera + pestaña -->
    <span class="absolute inset-x-0 bottom-0 top-5 rounded-[22px]" :style="{ background: back }" />
    <span class="absolute left-0 top-0 h-9 w-[46%] rounded-t-[18px]" :style="{ background: back }" />

    <!-- lo que asoma -->
    <span
      v-if="source.format === 'youtube' || source.format === 'image'"
      class="absolute left-[14%] top-7 h-[74px] w-[64%] -rotate-6 overflow-hidden rounded-xl bg-[#1d1b22] ring-2 ring-white/90 transition-transform duration-300 group-hover:-translate-y-1.5"
    >
      <img v-if="source.thumbnailUrl" :src="source.thumbnailUrl" alt="" class="size-full object-cover" loading="lazy" />
      <span v-if="source.format === 'youtube'" class="absolute inset-0 grid place-items-center">
        <span class="grid h-7 w-10 place-items-center rounded-lg bg-[#ff3b30]">
          <span class="ml-0.5 border-y-[6px] border-l-[10px] border-y-transparent border-l-white" />
        </span>
      </span>
    </span>
    <template v-else>
      <span class="absolute left-[10%] top-8 h-20 w-[48%] -rotate-[8deg] rounded-lg bg-white/80 transition-transform duration-300 group-hover:-translate-y-1" />
      <span
        class="absolute right-[12%] top-6 h-[86px] w-[58%] rotate-[5deg] overflow-hidden rounded-lg bg-white p-2 shadow-soft transition-transform duration-300 group-hover:-translate-y-2"
      >
        <span v-if="excerpt" class="block text-[6.5px] leading-[1.35] text-[#3b3842]">{{ excerpt }}</span>
        <template v-else>
          <span v-for="w in [90, 70, 85, 60, 75]" :key="w" class="mb-1.5 block h-1 rounded bg-[#16141c]/12" :style="{ width: `${w}%` }" />
        </template>
      </span>
    </template>

    <!-- frente -->
    <span class="absolute inset-x-0 bottom-0 flex h-[60%] flex-col justify-between rounded-[22px] p-4" :style="{ background: front }">
      <span class="line-clamp-2 font-display text-[17px] font-bold leading-[1.1] tracking-[-0.02em]">{{ source.title }}</span>
      <span class="flex items-center justify-between gap-2 text-[12.5px] font-semibold">
        <span v-if="processing" class="flex items-center gap-1.5 opacity-80">
          <span class="size-2 animate-pulse rounded-full bg-[#16141c]" /> Mocca estudiando…
        </span>
        <span v-else-if="failed" class="flex items-center gap-1 opacity-80">
          <PhArrowsClockwise :size="14" weight="bold" /> Toca para reintentar
        </span>
        <span v-else-if="source.filling" class="flex items-center gap-1.5 opacity-80">
          <span class="size-2 animate-pulse rounded-full bg-[#16141c]" /> {{ source.bank.total }} · llegan más
        </span>
        <span v-else class="opacity-70">{{ source.bank.total }} preguntas</span>
        <span class="grid size-7 shrink-0 place-items-center rounded-full bg-white/55">
          <component :is="icon" :size="16" weight="bold" />
        </span>
      </span>
    </span>
  </motion.button>
</template>
