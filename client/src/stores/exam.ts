import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ExamInProgressDTO, ExamResultDTO } from '@vetquiz/shared'

/**
 * Caché del examen recién creado y del resultado recién corregido, para que las pantallas
 * Examen y Resultados no tengan que volver a pedirlos (si se recarga la página, sí los piden).
 */
export const useExamStore = defineStore('exam', () => {
  const active = ref<ExamInProgressDTO | null>(null)
  const shortBy = ref(0)
  const lastResult = ref<ExamResultDTO | null>(null)

  function setActive(exam: ExamInProgressDTO, short = 0) {
    active.value = exam
    shortBy.value = short
  }
  function setResult(result: ExamResultDTO) {
    lastResult.value = result
    if (active.value?.id === result.id) active.value = null
  }
  return { active, shortBy, lastResult, setActive, setResult }
})
