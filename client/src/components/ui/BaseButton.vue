<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import { pressable } from '@/lib/motion'

/**
 * night = acción principal de la app (pastilla negra, como las referencias).
 * primary = degradado, reservado para empezar / enviar examen.
 */
const props = withDefaults(
  defineProps<{
    variant?: 'night' | 'primary' | 'surface' | 'ghost'
    size?: 'md' | 'lg' | 'xl'
    block?: boolean
    loading?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'night', size: 'lg', type: 'button' },
)

const variants = {
  night: 'bg-night text-white',
  primary: 'bg-primary text-white',
  surface: 'bg-surface text-ink ring-1 ring-line',
  ghost: 'bg-transparent text-ink-2',
}
const sizes = {
  md: 'h-11 px-5 text-[15px] gap-2',
  lg: 'h-14 px-7 text-base gap-2.5',
  xl: 'h-[68px] px-8 text-lg gap-3',
}

const isDisabled = computed(() => props.disabled || props.loading)
</script>

<template>
  <motion.button
    :type="type"
    :disabled="isDisabled"
    :aria-busy="loading || undefined"
    v-bind="isDisabled ? {} : pressable"
    :class="[
      'relative inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-display font-bold',
      'disabled:cursor-not-allowed disabled:opacity-45',
      variants[variant],
      sizes[size],
      block && 'w-full',
    ]"
  >
    <span v-if="loading" class="absolute inset-0 grid place-items-center" aria-hidden="true">
      <span class="size-5 animate-spin rounded-full border-[3px] border-current border-r-transparent" />
    </span>
    <span :class="['inline-flex items-center gap-[inherit]', loading && 'invisible']">
      <slot />
    </span>
  </motion.button>
</template>
