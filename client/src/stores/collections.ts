import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CollectionDTO, CollectionInput, SourceColor } from '@vetquiz/shared'
import { api } from '@/api/client'

/** Carpetas que agrupan fuentes (cada persona tiene las suyas). Una fuente vive en una sola carpeta. */
export const useCollectionsStore = defineStore('collections', () => {
  const list = ref<CollectionDTO[]>([])
  const loaded = ref(false)

  const byId = computed(() => new Map(list.value.map((c) => [c.id, c])))
  /** sourceId → carpeta donde está */
  const ofSource = computed(() => new Map(list.value.flatMap((c) => c.sourceIds.map((s) => [s, c] as const))))

  async function fetchAll() {
    list.value = await api.collections()
    loaded.value = true
  }

  // el servidor saca la fuente de las demás carpetas: se recarga todo para quedar igual
  async function create(input: CollectionInput) {
    const c = await api.createCollection(input)
    await fetchAll()
    return c
  }
  async function update(id: string, patch: { name?: string; color?: SourceColor }) {
    const c = await api.updateCollection(id, patch)
    list.value = list.value.map((x) => (x.id === id ? c : x))
  }
  async function remove(id: string) {
    await api.deleteCollection(id)
    list.value = list.value.filter((c) => c.id !== id)
  }
  async function add(id: string, sourceIds: string[]) {
    await api.addToCollection(id, sourceIds)
    await fetchAll()
  }
  async function takeOut(id: string, sourceId: string) {
    const c = await api.removeFromCollection(id, sourceId)
    list.value = list.value.map((x) => (x.id === id ? c : x))
  }

  return { list, loaded, byId, ofSource, fetchAll, create, update, remove, add, takeOut }
})
