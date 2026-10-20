<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { MotionConfig } from 'motion-v'
import BottomNav from '@/components/BottomNav.vue'
import NewSourceSheet from '@/components/source/NewSourceSheet.vue'
import AccessGate from '@/components/AccessGate.vue'
import { api, LOCKED_EVENT } from '@/api/client'
import { useSourcesStore } from '@/stores/sources'
import { useStatsStore } from '@/stores/stats'

// En la nube la API pide código de acceso; en local nunca aparece
const locked = ref(false)
const lock = () => (locked.value = true)
// Al volver a la app (otra pestaña, celular bloqueado…) se refrescan fuentes y stats: nada queda viejo
const sources = useSourcesStore()
const stats = useStatsStore()
function refreshOnReturn() {
  if (document.visibilityState !== 'visible' || locked.value) return
  if (sources.loaded) sources.fetchAll().catch(() => {})
  if (stats.stats) stats.refresh().catch(() => {})
}
onMounted(() => document.addEventListener('visibilitychange', refreshOnReturn))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', refreshOnReturn))

onMounted(async () => {
  window.addEventListener(LOCKED_EVENT, lock)
  const status = await api.accessStatus().catch(() => null)
  if (status?.required && !status.granted) locked.value = true
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
    </template>
  </MotionConfig>
</template>
