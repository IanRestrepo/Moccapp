import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { SourceDTO } from '@vetquiz/shared'
import { api } from '@/api/client'

const POLL_MS = 2500

/** Fuentes de estudio. Las que están procesando se consultan solas hasta que terminen. */
export const useSourcesStore = defineStore('sources', () => {
  const list = ref<SourceDTO[]>([])
  const loaded = ref(false)
  const pollers = new Map<string, number>()

  const byId = computed(() => new Map(list.value.map((s) => [s.id, s])))

  function upsert(source: SourceDTO) {
    const i = list.value.findIndex((s) => s.id === source.id)
    if (i === -1) list.value.unshift(source)
    else list.value[i] = source
    if (source.status === 'processing' || source.filling) watchProcessing(source.id)
  }

  function remove(id: string) {
    list.value = list.value.filter((s) => s.id !== id)
  }

  async function fetchAll() {
    const sources = await api.listSources()
    list.value = sources
    loaded.value = true
    sources.filter((s) => s.status === 'processing' || s.filling).forEach((s) => watchProcessing(s.id))
  }

  function watchProcessing(id: string) {
    if (pollers.has(id)) return
    const tick = async () => {
      try {
        const s = await api.getSource(id)
        upsert(s)
        // sigue consultando mientras procesa o mientras llegan más preguntas en segundo plano
        if (s.status !== 'processing' && !s.filling) return void pollers.delete(id)
      } catch {
        // red caída: se sigue intentando
      }
      pollers.set(id, window.setTimeout(tick, POLL_MS))
    }
    pollers.set(id, window.setTimeout(tick, POLL_MS))
  }

  return { list, loaded, byId, upsert, remove, fetchAll, watchProcessing }
})
