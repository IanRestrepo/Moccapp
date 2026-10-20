import { ref } from 'vue'

const isDark = ref(document.documentElement.dataset.theme === 'dark')

/** Tema claro/oscuro; respeta el del sistema hasta que ella elija uno. */
export function useTheme() {
  return {
    isDark,
    toggle() {
      isDark.value = !isDark.value
      const theme = isDark.value ? 'dark' : 'light'
      document.documentElement.dataset.theme = theme
      try {
        localStorage.setItem('vq-theme', theme)
      } catch {}
    },
  }
}
