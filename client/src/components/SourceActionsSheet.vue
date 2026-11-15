<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { PhBookOpenText, PhExam, PhFolderSimple, PhFolderSimpleMinus, PhTrash, PhWarningCircle } from '@phosphor-icons/vue'
import type { SourceDTO } from '@vetquiz/shared'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import { api, ApiRequestError } from '@/api/client'
import { useSourcesStore } from '@/stores/sources'
import { uploadedLong } from '@/lib/format'

/**
 * Opciones de una fuente, en una hoja que sube desde abajo (cómodo en el celular): abrir la guía, hacer examen,
 * mover a una carpeta, sacarla de la carpeta y borrarla (con confirmación clara).
 */
const props = defineProps<{ source: SourceDTO | null; inCollection?: boolean }>()
const emit = defineEmits<{ close: []; move: [SourceDTO]; takeOut: [SourceDTO] }>()
const router = useRouter()
const sources = useSourcesStore()
const confirming = ref(false)
const busy = ref(false)
const error = ref('')

watch(
  () => props.source,
  () => {
    confirming.value = false
    error.value = ''
  },
)

function go(path: string | { path: string; query: Record<string, string> }) {
  emit('close')
  router.push(path)
}
async function remove() {
  const s = props.source
  if (!s) return
  if (!confirming.value) return void (confirming.value = true)
  busy.value = true
  try {
    await api.deleteSource(s.id)
    sources.remove(s.id)
    emit('close')
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No se pudo borrar.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BottomSheet :open="!!source" :title="source?.title ?? ''" @close="emit('close')">
    <div v-if="source" class="flex flex-col gap-2 pb-2">
      <p class="-mt-2 mb-1 text-[13px] font-semibold text-ink-3">{{ uploadedLong(source.createdAt) }}</p>
      <template v-if="source.status === 'ready'">
        <button class="action" @click="go(`/guia/${source.id}`)">
          <PhBookOpenText :size="22" weight="bold" /> Abrir la guía de estudio
        </button>
        <button class="action" @click="go({ path: '/configurar', query: { source: source.id } })">
          <PhExam :size="22" weight="bold" /> Hacer un examen
        </button>
      </template>
      <button v-if="inCollection" class="action" @click="emit('takeOut', source)">
        <PhFolderSimpleMinus :size="22" weight="bold" /> Sacar de esta carpeta
      </button>
      <button v-else class="action" @click="emit('move', source)">
        <PhFolderSimple :size="22" weight="bold" /> Mover a una carpeta
      </button>

      <template v-if="source.mine">
        <p v-if="confirming" class="mt-2 flex items-start gap-2 rounded-[16px] bg-pink-tint px-4 py-3 text-[14px] font-semibold leading-snug">
          <PhWarningCircle :size="20" weight="fill" class="mt-px shrink-0 text-danger" />
          Se borra la fuente con su guía, sus preguntas y los exámenes que hiciste con ella. No se puede deshacer.
        </p>
        <button
          :class="['action', confirming ? 'action--danger-solid' : 'action--danger']"
          :disabled="busy"
          @click="remove"
        >
          <PhTrash :size="22" weight="bold" />
          {{ busy ? 'Borrando…' : confirming ? 'Sí, borrar para siempre' : 'Borrar fuente' }}
        </button>
        <button v-if="confirming" class="py-2 text-[14.5px] font-bold text-ink-2" @click="confirming = false">Mejor no</button>
      </template>
      <p v-else class="mt-1 px-1 text-[13px] text-ink-3">Esta fuente es de Ash: puedes estudiarla, pero no borrarla.</p>
      <p v-if="error" class="rounded-[14px] bg-pink-tint px-3 py-2 text-[13.5px] font-semibold">{{ error }}</p>
    </div>
  </BottomSheet>
</template>

<style scoped>
.action {
  display: flex;
  min-height: 56px;
  width: 100%;
  align-items: center;
  gap: 12px;
  border-radius: 18px;
  background: var(--vq-surface, #22202a);
  padding: 0 18px;
  text-align: left;
  font-size: 16px;
  font-weight: 700;
  box-shadow: inset 0 0 0 1px var(--vq-line, rgba(255, 255, 255, 0.08));
}
.action:active {
  transform: scale(0.98);
}
.action--danger {
  color: var(--vq-danger, #e5484d);
}
.action--danger-solid {
  background: var(--vq-danger, #e5484d);
  color: #fff;
  box-shadow: none;
}
</style>
