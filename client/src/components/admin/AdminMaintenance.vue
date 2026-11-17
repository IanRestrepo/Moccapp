<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { MaintenanceNotice } from '@vetquiz/shared'
import { api, ApiRequestError } from '@/api/client'
import BaseButton from '@/components/ui/BaseButton.vue'
const draft = ref<MaintenanceNotice | null>(null)
const busy = ref(false)
const error = ref('')
const emit = defineEmits<{ toast: [ok: boolean, text: string] }>()
async function load() {
  error.value = ''
  try { draft.value = await api.adminMaintenanceNotice() }
  catch { error.value = 'No se pudo cargar el aviso.' }
}
onMounted(load)
async function save() {
  if (!draft.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    draft.value = await api.saveMaintenanceNotice(draft.value)
    emit('toast', true, draft.value.enabled ? 'Aviso guardado.' : 'Aviso desactivado.')
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No se pudo guardar el aviso.'
  } finally { busy.value = false }
}
</script>

<template>
  <section class="mb-5 rounded-[20px] bg-surface p-4 ring-1 ring-line">
    <h2 class="text-[18px] font-bold">Aviso de mantenimiento</h2>
    <p class="mt-1 text-[13px] text-ink-2">Se muestra a todos sin impedir el estudio. Los cambios aparecen en un minuto o al volver a la app.</p>
    <form v-if="draft" class="mt-3 space-y-3" @submit.prevent="save">
      <fieldset :disabled="busy" class="space-y-3">
        <label class="flex items-center gap-2 text-sm font-semibold"><input v-model="draft.enabled" type="checkbox" /> Mostrar aviso</label>
        <label class="block text-sm font-semibold">Título
          <input v-model="draft.title" required maxlength="100" class="mt-1 block w-full rounded-xl border border-line bg-surface-2 p-3" />
        </label>
        <label class="block text-sm font-semibold">Mensaje
          <textarea v-model="draft.message" required maxlength="300" rows="2" class="mt-1 block w-full rounded-xl border border-line bg-surface-2 p-3" />
        </label>
      </fieldset>
      <BaseButton type="submit" size="md" :loading="busy" :disabled="!draft.title.trim() || !draft.message.trim()">Guardar aviso</BaseButton>
    </form>
    <p v-if="error" role="alert" class="mt-2 text-sm text-danger">{{ error }}</p>
    <button v-if="!draft && error" class="mt-2 text-sm underline" @click="load">Reintentar</button>
  </section>
</template>
