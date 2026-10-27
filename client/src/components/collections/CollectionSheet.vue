<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SOURCE_COLORS, type SourceColor } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import SourcePicker from '@/components/collections/SourcePicker.vue'
import { ApiRequestError } from '@/api/client'
import { colorClasses } from '@/lib/motion'
import { useCollectionsStore } from '@/stores/collections'
import { useSourcesStore } from '@/stores/sources'

/** Crear una carpeta: nombre, color y las fuentes que van adentro. */
const props = defineProps<{ open: boolean; preselect?: string[] }>()
const emit = defineEmits<{ close: []; created: [id: string] }>()
const collections = useCollectionsStore()
const sources = useSourcesStore()

const name = ref('')
const color = ref<SourceColor | null>(null)
const picked = ref<string[]>([])
const saving = ref(false)
const error = ref('')
watch(
  () => props.open,
  (o) => {
    if (!o) return
    name.value = ''
    color.value = null
    picked.value = [...(props.preselect ?? [])]
    error.value = ''
  },
)
const available = computed(() => sources.list.filter((s) => s.status === 'ready' || s.status === 'processing'))

async function save() {
  if (!name.value.trim()) return
  saving.value = true
  error.value = ''
  try {
    const c = await collections.create({ name: name.value.trim(), color: color.value ?? undefined, sourceIds: picked.value })
    emit('created', c.id)
    emit('close')
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No se pudo crear la carpeta.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BottomSheet :open="open" title="Nueva carpeta" @close="emit('close')">
    <label class="block">
      <span class="text-[13px] font-bold text-ink-2">Nombre</span>
      <input
        v-model="name"
        maxlength="60"
        placeholder="Ej: BIOQUÍMICA SEMESTRE 2"
        class="mt-1 h-12 w-full rounded-[16px] bg-surface px-4 font-display text-[17px] font-bold uppercase ring-1 ring-line placeholder:normal-case placeholder:font-medium focus:outline-none focus:ring-[2.5px] focus:ring-lilac"
        @keydown.enter="save"
      />
    </label>
    <div class="mt-3 flex gap-2" role="radiogroup" aria-label="Color">
      <button
        v-for="c in SOURCE_COLORS"
        :key="c"
        role="radio"
        :aria-checked="color === c"
        :aria-label="c"
        :class="['size-9 rounded-full transition-transform', colorClasses[c].bg, color === c ? 'scale-110 ring-[3px] ring-ink ring-offset-2 ring-offset-bg' : '']"
        @click="color = c"
      />
    </div>
    <p class="mt-5 text-[13px] font-bold text-ink-2">¿Qué fuentes van adentro? ({{ picked.length }})</p>
    <div class="mt-2 pb-2">
      <SourcePicker v-model="picked" :sources="available" />
    </div>
    <template #footer>
      <p v-if="error" class="mb-2 text-[13.5px] font-bold text-danger">{{ error }}</p>
      <BaseButton size="xl" block :disabled="!name.trim()" :loading="saving" @click="save">
        Crear carpeta{{ picked.length ? ` con ${picked.length}` : '' }}
      </BaseButton>
    </template>
  </BottomSheet>
</template>
