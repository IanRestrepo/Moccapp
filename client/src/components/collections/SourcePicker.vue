<script setup lang="ts">
import { PhCheck } from '@phosphor-icons/vue'
import type { SourceDTO } from '@vetquiz/shared'
import { colorClasses } from '@/lib/motion'
import { useCollectionsStore } from '@/stores/collections'

/** Lista para elegir varias fuentes. Avisa si ya están en otra carpeta (al elegirlas se mueven). */
const props = defineProps<{ sources: SourceDTO[]; modelValue: string[]; currentCollectionId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()
const collections = useCollectionsStore()

const toggle = (id: string) =>
  emit('update:modelValue', props.modelValue.includes(id) ? props.modelValue.filter((x) => x !== id) : [...props.modelValue, id])
const elsewhere = (id: string) => {
  const c = collections.ofSource.get(id)
  return c && c.id !== props.currentCollectionId ? c.name : null
}
</script>

<template>
  <ul class="flex flex-col gap-2">
    <li v-for="s in sources" :key="s.id">
      <button
        type="button"
        role="checkbox"
        :aria-checked="modelValue.includes(s.id)"
        :class="[
          'flex w-full items-center gap-3 rounded-[18px] p-2.5 pr-3 text-left transition-colors',
          modelValue.includes(s.id) ? colorClasses[s.color].solid : 'bg-surface ring-1 ring-line',
        ]"
        @click="toggle(s.id)"
      >
        <span :class="['grid size-8 shrink-0 place-items-center rounded-full', modelValue.includes(s.id) ? 'bg-night text-white' : 'bg-surface-2']">
          <PhCheck v-if="modelValue.includes(s.id)" :size="15" weight="bold" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-display text-[15.5px] font-bold">{{ s.title }}</span>
          <span class="block truncate text-[12.5px] font-semibold opacity-70">
            {{ s.bank.total }} preguntas{{ elsewhere(s.id) ? ` · está en «${elsewhere(s.id)}»` : '' }}
          </span>
        </span>
      </button>
    </li>
    <li v-if="!sources.length" class="rounded-[18px] bg-surface p-4 text-[14px] font-medium text-ink-2 ring-1 ring-line">
      No hay fuentes para agregar. Sube una con el botón +.
    </li>
  </ul>
</template>
