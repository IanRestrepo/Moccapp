import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ExamHistoryItemDTO, StatsDTO } from '@vetquiz/shared'
import { api } from '@/api/client'

/** XP, racha y últimos exámenes para Inicio. Se refresca al terminar un examen. */
export const useStatsStore = defineStore('stats', () => {
  const stats = ref<StatsDTO | null>(null)
  const recent = ref<ExamHistoryItemDTO[]>([])

  async function refresh() {
    const [s, h] = await Promise.all([api.stats(), api.history({ limit: 3 })])
    stats.value = s
    recent.value = h.exams
  }

  return { stats, recent, refresh }
})
