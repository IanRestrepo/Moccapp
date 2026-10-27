<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { PresenceView } from '@vetquiz/shared'
import { MotionConfig } from 'motion-v'
import BottomNav from '@/components/BottomNav.vue'
import NewSourceSheet from '@/components/source/NewSourceSheet.vue'
import AccessGate from '@/components/AccessGate.vue'
import MoccaLove from '@/components/mascot/MoccaLove.vue'
import { api, LOCKED_EVENT } from '@/api/client'
import { useSourcesStore } from '@/stores/sources'
import { useStatsStore } from '@/stores/stats'
import { useUiStore } from '@/stores/ui'

// En la nube la API pide código de acceso; en local nunca aparece
const locked = ref(false)
const lock = () => (locked.value = true)
// Al volver a la app (otra pestaña, celular bloqueado…) se refrescan fuentes y stats: nada queda viejo
const sources = useSourcesStore()
const ui = useUiStore()
const stats = useStatsStore()
function refreshOnReturn() {
  if (document.visibilityState !== 'visible' || locked.value) return
  if (sources.loaded) sources.fetchAll().catch(() => {})
  if (stats.stats) stats.refresh().catch(() => {})
}
onMounted(() => document.addEventListener('visibilitychange', refreshOnReturn))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', refreshOnReturn))

// Señal de vida para el panel del administrador: cada 30 s mientras la app está visible
const route = useRoute()
const router = useRouter()
// cada 15 s: también trae los mensajitos de Ian para que Mocca los diga casi al instante
const PING_MS = 15_000
function viewOf(path: string): PresenceView {
  if (path === '/') return 'home'
  const map: [string, PresenceView][] = [
    ['/fuentes', 'sources'],
    ['/carpeta/', 'sources'],
    ['/configurar', 'configure'],
    ['/estudiar', 'study'],
    ['/camino', 'path'],
    ['/leccion/', 'lesson'],
    ['/examen/', 'exam'],
    ['/resultados/', 'results'],
    ['/historial', 'history'],
    ['/premios', 'rewards'],
    ['/mocca', 'mocca'],
  ]
  return map.find(([p]) => path.startsWith(p))?.[1] ?? 'other'
}
function ping() {
  if (document.visibilityState !== 'visible' || locked.value || route.path.startsWith('/admin')) return
  api
    .ping(viewOf(route.path))
    .then((r) => r?.messages?.forEach((m) => window.dispatchEvent(new CustomEvent('vq:mocca-message', { detail: m }))))
    .catch(() => {})
}
let pingTimer = 0
onMounted(() => {
  pingTimer = window.setInterval(ping, PING_MS)
  document.addEventListener('visibilitychange', ping)
})
onBeforeUnmount(() => {
  clearInterval(pingTimer)
  document.removeEventListener('visibilitychange', ping)
})
watch(() => route.path, ping)

onMounted(async () => {
  window.addEventListener(LOCKED_EVENT, lock)
  const status = await api.accessStatus().catch(() => null)
  if (status?.required && !status.granted) locked.value = true
  // solo es Ash si el servidor lo dice explícitamente
  if (status?.granted) ui.setProfile(status.owner === true, status.name ?? null)
  // si estaba en Premios y resultó no ser Ash, fuera
  if (!ui.owner && route.path === '/premios') router.replace('/')
  ping()
})
onBeforeUnmount(() => window.removeEventListener(LOCKED_EVENT, lock))
</script>

<template>
  <!-- reducedMotion="user": motion-v respeta prefers-reduced-motion en todos los componentes -->
  <MotionConfig reduced-motion="user">
    <AccessGate v-if="locked" />
    <template v-else>
      <RouterView />
      <BottomNav v-if="$route.meta.nav" />
      <NewSourceSheet />
      <!-- mensajitos de Ian para todas; los de amor al azar solo para Ash -->
      <MoccaLove :random-love="ui.owner" />
    </template>
  </MotionConfig>
</template>
