import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './styles/main.css'
// escucha desde el arranque el aviso de "se puede instalar" (Android)
import './composables/usePhone'

// Tema: respeta el sistema hasta que ella elija uno
const saved = (() => {
  try {
    return localStorage.getItem('vq-theme')
  } catch {
    return null
  }
})()
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
document.documentElement.dataset.theme = saved ?? (prefersDark ? 'dark' : 'light')

createApp(App).use(createPinia()).use(router).mount('#app')
