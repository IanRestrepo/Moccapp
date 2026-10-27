<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PhCheck, PhFolderSimple, PhFolderSimplePlus } from '@phosphor-icons/vue'
import type { SourceDTO } from '@vetquiz/shared'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import { ApiRequestError } from '@/api/client'
import { colorClasses } from '@/lib/motion'
import { useCollectionsStore } from '@/stores/collections'

/** "Mover a carpeta" de una fuente: elegir carpeta, crear una nueva o sacarla de la que está. */
const props = defineProps<{ source: SourceDTO | null }>()
const emit = defineEmits<{ close: [] }>()
const collections = useCollectionsStore()

const current = computed(() => (props.source ? collections.ofSource.get(props.source.id) : undefined))
const creating = ref(false)
const name = ref('')
const busy = ref(false)
const error = ref('')
watch(
  () => props.source,
  () => {
    creating.value = false
    name.value = ''
    error.value = ''
  },
)

async function run(fn: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try {
    await fn()
    emit('close')
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No se pudo mover.'
  } finally {
    busy.value = false
  }
}
const moveTo = (id: string) => props.source && id !== current.value?.id && run(() => collections.add(id, [props.source!.id]))
const takeOut = () => props.source && current.value && run(() => collections.takeOut(current.value!.id, props.source!.id))
const createAndMove = () => props.source && name.value.trim() && run(() => collections.create({ name: name.value.trim(), sourceIds: [props.source!.id] }))
</script>

<template>
  <BottomSheet :open="!!source" title="Mover a carpeta" @close="emit('close')">
    <p class="truncate text-[14px] font-semibold text-ink-2">«{{ source?.title }}»</p>
    <ul class="mt-3 flex flex-col gap-2">
      <li v-for="c in collections.list" :key="c.id">
        <button
          :disabled="busy"
          :class="['flex w-full items-center gap-3 rounded-[18px] p-3 text-left', c.id === current?.id ? colorClasses[c.color].solid : 'bg-surface ring-1 ring-line']"
          @click="moveTo(c.id)"
        >
          <span :class="['grid size-9 shrink-0 place-items-center rounded-[12px]', colorClasses[c.color].bg]">
            <PhFolderSimple :size="18" weight="fill" class="text-on-color" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-display text-[16px] font-bold uppercase">{{ c.name }}</span>
            <span class="text-[12.5px] font-semibold opacity-70">{{ c.sourceIds.length }} fuentes</span>
          </span>
          <PhCheck v-if="c.id === current?.id" :size="20" weight="bold" />
        </button>
      </li>
      <li>
        <form v-if="creating" class="flex gap-2" @submit.prevent="createAndMove">
          <input
            v-model="name"
            maxlength="60"
            autofocus
            placeholder="Nombre de la carpeta"
            class="h-12 min-w-0 flex-1 rounded-[16px] bg-surface px-4 font-bold uppercase ring-1 ring-line placeholder:normal-case focus:outline-none focus:ring-[2.5px] focus:ring-lilac"
          />
          <button class="h-12 shrink-0 rounded-[16px] bg-night px-4 font-bold text-white disabled:opacity-40" :disabled="!name.trim() || busy">Crear</button>
        </form>
        <button v-else class="flex w-full items-center gap-3 rounded-[18px] border-2 border-dashed border-ink/15 p-3 text-left font-bold" @click="creating = true">
          <PhFolderSimplePlus :size="22" weight="bold" /> Nueva carpeta
        </button>
      </li>
    </ul>
    <button v-if="current" class="mt-4 w-full rounded-[16px] py-3 text-[14px] font-bold text-ink-2 underline" :disabled="busy" @click="takeOut">
      Sacar de «{{ current.name }}»
    </button>
    <p v-if="error" class="mt-2 text-[13.5px] font-bold text-danger">{{ error }}</p>
    <div class="h-2" />
  </BottomSheet>
</template>
