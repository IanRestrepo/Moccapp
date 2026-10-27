import { defineStore } from 'pinia'
import { ref } from 'vue'

const OWNER_KEY = 'vq-owner'
function readOwner() {
  try {
    return localStorage.getItem(OWNER_KEY) === '1'
  } catch {
    return false
  }
}

/** Estado global de la interfaz: el popup de nueva fuente se abre desde Inicio, Fuentes y la barra inferior. */
export const useUiStore = defineStore('ui', () => {
  const newSourceOpen = ref(false)
  const openNewSource = () => (newSourceOpen.value = true)
  const closeNewSource = () => (newSourceOpen.value = false)
  /** Perfil: Ash es la dueña (huesitos y premios); las invitadas no los ven */
  // Nadie es Ash hasta que el servidor lo confirme: si la conexión falla, Magola no ve premios
  // ni los mensajitos de amor. Se recuerda el último valor para que Ash no vea un parpadeo.
  const owner = ref(readOwner())
  const profileName = ref<string | null>(null)
  /** true cuando el servidor ya dijo quién es */
  const known = ref(false)
  let markReady: () => void = () => {}
  /** Se resuelve cuando ya se sabe quién es (para el router: /premios) */
  const ownerKnown = new Promise<void>((r) => (markReady = r))
  function setProfile(isOwner: boolean, name: string | null) {
    owner.value = isOwner
    profileName.value = name
    try {
      localStorage.setItem(OWNER_KEY, isOwner ? '1' : '0')
    } catch {
      /* sin almacenamiento */
    }
    known.value = true
    markReady()
  }
  return { newSourceOpen, openNewSource, closeNewSource, owner, profileName, known, ownerKnown, setProfile }
})
