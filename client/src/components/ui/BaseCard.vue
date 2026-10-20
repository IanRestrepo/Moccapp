<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import type { SourceColor } from '@vetquiz/shared'
import { colorClasses, pressable, spring } from '@/lib/motion'

/**
 * Bloque base. Con `color`: bloque saturado plano con texto negro. Sin color: blanco con borde fino.
 * `feedback` hace rebotar (correcta) o sacudir (incorrecta) la tarjeta.
 */
const props = withDefaults(
  defineProps<{
    color?: SourceColor
    as?: 'div' | 'button' | 'article' | 'section'
    interactive?: boolean
    padding?: 'none' | 'md' | 'lg'
    feedback?: 'correct' | 'wrong' | null
  }>(),
  { as: 'div', padding: 'md', feedback: null },
)

const tone = computed(() => (props.color ? colorClasses[props.color].solid : 'bg-surface text-ink ring-1 ring-line'))
const pad = { none: '', md: 'p-5', lg: 'p-6' }
const Tag = computed(() => motion[props.as])
</script>

<template>
  <component
    :is="Tag"
    v-bind="interactive ? pressable : {}"
    :animate="feedback === 'correct' ? { scale: [1, 1.035, 1] } : { scale: 1 }"
    :transition="spring.jelly"
    :class="['relative rounded-card', tone, pad[padding], interactive && 'text-left', feedback === 'wrong' && 'vq-shake']"
  >
    <slot />
  </component>
</template>

<style scoped>
.vq-shake {
  animation: vq-shake 0.42s var(--ease-out-soft);
}
</style>
