<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import { PhFolderSimple } from '@phosphor-icons/vue'
import type { CollectionDTO, SourceColor, SourceDTO } from '@vetquiz/shared'
import { pressable } from '@/lib/motion'

/**
 * Carpeta grande (archivador): más ancha que las de cada fuente y con las carpeticas de adentro
 * asomando por arriba, cada una con su color.
 */
const props = defineProps<{ collection: CollectionDTO; sources: SourceDTO[] }>()

// tono trasero elegido a mano (igual que SourceFolder)
const BACK: Record<SourceColor, string> = {
  yellow: '#f2b31f',
  orange: '#f07b26',
  lilac: '#8d6ce6',
  pink: '#ee5fa8',
  mint: '#35b673',
  sky: '#5a95ef',
}
const inside = computed(() => props.collection.sourceIds.map((id) => props.sources.find((s) => s.id === id)).filter((s): s is SourceDTO => !!s))
const peek = computed(() => inside.value.slice(0, 4))
const questions = computed(() => inside.value.reduce((a, s) => a + s.bank.total, 0))
</script>

<template>
  <motion.button v-bind="pressable" type="button" class="group relative block h-[150px] w-full text-left text-on-color">
    <!-- parte trasera + pestaña -->
    <span class="absolute inset-x-0 bottom-0 top-6 rounded-[26px]" :style="{ background: BACK[collection.color] }" />
    <span class="absolute left-0 top-0 h-10 w-[38%] rounded-t-[20px]" :style="{ background: BACK[collection.color] }" />

    <!-- carpeticas de adentro asomando -->
    <span class="absolute right-[6%] top-3 flex gap-1.5">
      <span
        v-for="(s, i) in peek"
        :key="s.id"
        class="h-16 w-12 rounded-t-[10px] ring-2 ring-white/80 transition-transform duration-300 group-hover:-translate-y-1.5"
        :style="{ background: `var(--vq-${s.color})`, transform: `rotate(${[-6, 3, -2, 5][i]}deg)` }"
      />
    </span>

    <!-- frente -->
    <span class="absolute inset-x-0 bottom-0 flex h-[64%] items-end justify-between gap-3 rounded-[26px] p-4" :style="{ background: `var(--vq-${collection.color})` }">
      <span class="min-w-0">
        <span class="line-clamp-2 font-display text-[20px] font-extrabold uppercase leading-[1.05] tracking-[-0.01em]">{{ collection.name }}</span>
        <span class="mt-1 block text-[12.5px] font-semibold opacity-70">
          {{ inside.length }} {{ inside.length === 1 ? 'fuente' : 'fuentes' }} · {{ questions }} preguntas
        </span>
      </span>
      <span class="grid size-9 shrink-0 place-items-center rounded-full bg-white/55">
        <PhFolderSimple :size="18" weight="fill" />
      </span>
    </span>
  </motion.button>
</template>
