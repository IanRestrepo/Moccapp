<script setup lang="ts">
import { motion } from 'motion-v'
import { pressable } from '@/lib/motion'

/** Píldora: sin seleccionar = blanca con borde fino; seleccionada = negra (como el día activo de la referencia). */
withDefaults(defineProps<{ selected?: boolean; size?: 'sm' | 'md' }>(), { size: 'md' })
defineEmits<{ click: [MouseEvent] }>()
</script>

<template>
  <motion.button
    type="button"
    role="radio"
    :aria-checked="selected"
    v-bind="pressable"
    :class="[
      'inline-flex items-center justify-center rounded-full font-display font-bold transition-colors duration-150',
      size === 'sm' ? 'h-10 whitespace-nowrap px-3 text-[13px]' : 'h-12 px-5 text-[15px]',
      selected ? 'bg-night text-white' : 'bg-surface text-ink ring-1 ring-line',
    ]"
    @click="$emit('click', $event)"
  >
    <slot />
  </motion.button>
</template>
