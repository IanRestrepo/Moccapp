<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { PhWrench } from '@phosphor-icons/vue'
import type { MaintenanceNotice } from '@vetquiz/shared'
import { api } from '@/api/client'
const notice = ref<MaintenanceNotice | null>(null)
let timer = 0
let active = true
async function refresh() {
  if (document.visibilityState !== 'visible') return
  try {
    const value = await api.maintenanceNotice()
    if (active) notice.value = value
  } catch { /* Un problema al consultar el aviso no bloquea el estudio. */ }
}
onMounted(() => {
  refresh()
  timer = window.setInterval(refresh, 60_000)
  document.addEventListener('visibilitychange', refresh)
})
onBeforeUnmount(() => {
  active = false
  clearInterval(timer)
  document.removeEventListener('visibilitychange', refresh)
})
</script>

<template>
  <aside v-if="notice?.enabled" role="status" class="border-b border-line bg-yellow-tint px-4 py-2 text-ink">
    <div class="mx-auto flex max-w-3xl items-start gap-2 text-[12px] leading-snug">
      <PhWrench :size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
      <p class="break-words"><strong class="font-bold">{{ notice.title }}</strong><span class="ml-1">{{ notice.message }}</span></p>
    </div>
  </aside>
</template>
