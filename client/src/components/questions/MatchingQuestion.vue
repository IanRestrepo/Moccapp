<script setup lang="ts">
import { computed, ref } from 'vue'
import { motion } from 'motion-v'
import { PhArrowDown } from '@phosphor-icons/vue'
import { pressable, spring } from '@/lib/motion'

/**
 * Emparejar pensado para celular: tocas un concepto (queda activo) y luego su pareja abajo.
 * Cada pareja toma un color. Tocar un concepto ya emparejado lo suelta.
 * modelValue[i] = índice en `right` (orden mostrado) elegido para left[i]; -1 = sin pareja.
 */
const props = defineProps<{ left: string[]; right: string[]; modelValue: number[] | null }>()
const emit = defineEmits<{ 'update:modelValue': [number[]] }>()

const COLORS = ['bg-yellow', 'bg-sky', 'bg-pink', 'bg-mint', 'bg-orange', 'bg-lilac']
const matches = computed(() => props.modelValue ?? props.left.map(() => -1))
const firstFree = matches.value.findIndex((m) => m === -1)
const active = ref<number | null>(firstFree === -1 ? null : firstFree)
const usedBy = computed(() => new Map(matches.value.map((r, l) => [r, l] as const).filter(([r]) => r >= 0)))

function tapLeft(i: number) {
  if (matches.value[i]! >= 0) {
    const next = [...matches.value]
    next[i] = -1
    emit('update:modelValue', next)
  }
  active.value = i
}

function tapRight(r: number) {
  const next = [...matches.value]
  const owner = usedBy.value.get(r)
  if (owner !== undefined) next[owner] = -1 // si ya estaba usada, se mueve
  const target = active.value ?? next.findIndex((m) => m === -1)
  if (target === -1 || target === null) return
  next[target] = r
  emit('update:modelValue', next)
  // pasa solo al siguiente concepto sin pareja
  const nextFree = next.findIndex((m) => m === -1)
  active.value = nextFree === -1 ? null : nextFree
}
</script>

<template>
  <div>
    <ol class="flex flex-col gap-2">
      <li v-for="(l, i) in left" :key="l">
        <motion.button
          type="button"
          v-bind="pressable"
          :aria-pressed="active === i"
          :class="[
            'flex w-full items-center gap-3 rounded-[20px] p-3 text-left transition-colors duration-150',
            matches[i]! >= 0 ? [COLORS[i % COLORS.length], 'text-on-color'] : 'bg-surface ring-1 ring-line',
            active === i && 'ring-[3px] ring-night ring-inset',
          ]"
          @click="tapLeft(i)"
        >
          <span class="grid size-8 shrink-0 place-items-center rounded-full bg-white/60 font-display text-[14px] font-extrabold">{{ i + 1 }}</span>
          <span class="min-w-0 flex-1">
            <span class="block text-[15px] font-bold leading-snug">{{ l }}</span>
            <span v-if="matches[i]! >= 0" class="mt-0.5 block text-[13.5px] font-semibold leading-snug opacity-80">→ {{ right[matches[i]!] }}</span>
            <span v-else-if="active === i" class="mt-0.5 block text-[13px] font-semibold text-ink-2">Elige su pareja abajo</span>
          </span>
        </motion.button>
      </li>
    </ol>

    <p class="mb-2.5 mt-5 flex items-center gap-1.5 px-1 text-[13px] font-bold text-ink-2">
      <PhArrowDown :size="14" weight="bold" /> Parejas
    </p>
    <div class="flex flex-wrap gap-2">
      <motion.button
        v-for="(r, ri) in right"
        :key="r"
        type="button"
        v-bind="pressable"
        :animate="{ opacity: usedBy.has(ri) ? 0.45 : 1 }"
        :transition="spring.press"
        :class="[
          'rounded-[16px] px-3.5 py-2.5 text-left text-[14px] font-semibold leading-snug',
          usedBy.has(ri) ? [COLORS[usedBy.get(ri)! % COLORS.length], 'text-on-color'] : 'bg-surface ring-1 ring-line',
        ]"
        @click="tapRight(ri)"
      >
        {{ r }}
      </motion.button>
    </div>
  </div>
</template>
