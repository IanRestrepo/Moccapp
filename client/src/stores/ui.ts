import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Estado global de la interfaz: el popup de nueva fuente se abre desde Inicio, Fuentes y la barra inferior. */
export const useUiStore = defineStore('ui', () => {
  const newSourceOpen = ref(false)
  const openNewSource = () => (newSourceOpen.value = true)
  const closeNewSource = () => (newSourceOpen.value = false)
  return { newSourceOpen, openNewSource, closeNewSource }
})
