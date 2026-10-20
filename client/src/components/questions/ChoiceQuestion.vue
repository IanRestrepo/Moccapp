<script setup lang="ts">
import { motion } from 'motion-v'
import { PhCheck, PhX } from '@phosphor-icons/vue'
import { pressable, spring } from '@/lib/motion'

/** Opción múltiple (A–D) y Verdadero/Falso (dos bloques grandes). */
const props = defineProps<{ options: string[]; trueFalse?: boolean; modelValue: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [number] }>()
const pick = (i: number) => emit('update:modelValue', i)
</script>

<template>
  <div v-if="trueFalse" class="grid grid-cols-2 gap-3" role="radiogroup">
    <motion.button
      v-for="(opt, i) in options"
      :key="opt"
      type="button"
      role="radio"
      :aria-checked="modelValue === i"
      v-bind="pressable"
      :animate="{ scale: modelValue === i ? 1.03 : 1 }"
      :transition="spring.jelly"
      :class="[
        'flex h-36 flex-col items-center justify-center gap-3 rounded-[26px] font-display text-[20px] font-extrabold transition-colors duration-150',
        modelValue === i
          ? [i === 0 ? 'bg-mint' : 'bg-pink', 'text-on-color ring-[3px] ring-night ring-inset']
          : 'bg-surface ring-1 ring-line',
      ]"
      @click="pick(i)"
    >
      <span :class="['grid size-12 place-items-center rounded-full', modelValue === i ? 'bg-night text-white' : 'bg-surface-2']">
        <component :is="i === 0 ? PhCheck : PhX" :size="24" weight="bold" />
      </span>
      {{ opt }}
    </motion.button>
  </div>

  <div v-else class="flex flex-col gap-2.5" role="radiogroup">
    <motion.button
      v-for="(opt, i) in props.options"
      :key="opt"
      type="button"
      role="radio"
      :aria-checked="modelValue === i"
      v-bind="pressable"
      :class="[
        'flex items-center gap-3.5 rounded-[22px] p-3.5 pr-4 text-left text-[16px] font-semibold leading-snug transition-colors duration-150',
        modelValue === i ? 'bg-lilac text-on-color ring-[3px] ring-night ring-inset' : 'bg-surface ring-1 ring-line',
      ]"
      @click="pick(i)"
    >
      <span
        :class="[
          'grid size-9 shrink-0 place-items-center rounded-full font-display text-[15px] font-extrabold',
          modelValue === i ? 'bg-night text-white' : 'bg-surface-2',
        ]"
      >
        {{ 'ABCDE'[i] }}
      </span>
      {{ opt }}
    </motion.button>
  </div>
</template>
