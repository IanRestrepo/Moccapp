// Avance de la guía (temas terminados) y el examen completo del final.
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { QUESTION_TYPES } from '@vetquiz/shared'
import { api, ApiRequestError } from '@/api/client'
import { useExamStore } from '@/stores/exam'
import { useSound } from '@/composables/useSound'

/** Temas de una guía ya leídos/aprobados (quedan en este celular) */
export const readKey = (sourceId: string) => `vq-guide-read-${sourceId}`
export function loadRead(sourceId: string): Set<number> {
  try {
    return new Set<number>(JSON.parse(localStorage.getItem(readKey(sourceId)) ?? '[]'))
  } catch {
    return new Set<number>()
  }
}
export function saveRead(sourceId: string, set: Set<number>) {
  try {
    localStorage.setItem(readKey(sourceId), JSON.stringify([...set]))
  } catch {
    /* sin almacenamiento */
  }
}

/** Examen completo de toda la fuente (todos los tipos, nivel medio, 20 preguntas, 25 min) */
export function useFullExam() {
  const router = useRouter()
  const exams = useExamStore()
  const { play } = useSound()
  const starting = ref(false)
  const error = ref('')
  async function start(sourceId: string) {
    if (starting.value) return
    starting.value = true
    error.value = ''
    try {
      const res = await api.createExam({ sourceIds: [sourceId], level: 'medium', timeLimitMin: 25, questionCount: 20, types: [...QUESTION_TYPES] })
      exams.setActive(res.exam, res.shortBy)
      play('finish')
      router.push(`/examen/${res.exam.id}`)
    } catch (err) {
      error.value = err instanceof ApiRequestError ? err.message : 'No se pudo armar el examen. Intenta de nuevo.'
    } finally {
      starting.value = false
    }
  }
  return { start, starting, error }
}
