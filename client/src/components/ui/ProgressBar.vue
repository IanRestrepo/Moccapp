<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import { spring } from '@/lib/motion'

/** Barra que se llena con resorte. Con `segments` se dibuja por tramos (una pregunta = un tramo). */
const props = withDefaults(
  defineProps<{ value: number; max?: number; tone?: 'night' | 'yellow' | 'mint' | 'lilac'; segments?: number; label?: string }>(),
  { max: 1, tone: 'night' },
)

const pct = computed(() => Math.min(100, Math.max(0, (props.value / props.max) * 100)))
const fill = { night: 'bg-night dark:bg-ink', yellow: 'bg-yellow', mint: 'bg-mint', lilac: 'bg-lilac' }
</script>

<template>
  <div
    v-if="segments"
    role="progressbar"
    :aria-valuenow="value"
    :aria-valuemax="segments"
    :aria-label="label"
    class="flex w-full gap-1"
  >
    <span v-for="i in segments" :key="i" class="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
      <motion.span
        :class="['block h-full rounded-full', fill[tone]]"
        :initial="false"
        :animate="{ width: i <= value ? '100%' : '0%' }"
        :transition="spring.fill"
      />
    </span>
  </div>
  <div
    v-else
    role="progressbar"
    :aria-valuenow="Math.round(pct)"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-label="label"
    class="relative h-3 w-full overflow-hidden rounded-full bg-ink/10"
  >
    <motion.div
      :class="['absolute inset-y-0 left-0 rounded-full', fill[tone]]"
      :initial="{ width: '0%' }"
      :animate="{ width: `${pct}%` }"
      :transition="spring.fill"
    />
  </div>
</template>
