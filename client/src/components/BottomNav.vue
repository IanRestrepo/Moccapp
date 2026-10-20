<script setup lang="ts">
import { useRoute } from 'vue-router'
import { motion } from 'motion-v'
import { PhHouse, PhFolders, PhPlus, PhClockCounterClockwise, PhGift } from '@phosphor-icons/vue'
import { spring } from '@/lib/motion'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const ui = useUiStore()
const items = [
  { to: '/', label: 'Inicio', icon: PhHouse },
  { to: '/fuentes', label: 'Fuentes', icon: PhFolders },
  { to: '/premios', label: 'Premios', icon: PhGift },
  { to: '/historial', label: 'Historial', icon: PhClockCounterClockwise },
]
</script>

<template>
  <nav
    aria-label="Principal"
    class="fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-30 mx-auto flex w-[min(calc(100vw-32px),380px)] items-center justify-between rounded-full bg-night p-1.5 shadow-float"
  >
    <RouterLink
      v-for="item in items.slice(0, 2)"
      :key="item.to"
      :to="item.to"
      :aria-label="item.label"
      class="relative grid size-[54px] place-items-center rounded-full"
    >
      <motion.span
        v-if="route.path === item.to"
        layout-id="nav-active"
        class="absolute inset-0 rounded-full bg-white"
        :transition="spring.card"
      />
      <component
        :is="item.icon"
        :size="25"
        :weight="route.path === item.to ? 'fill' : 'bold'"
        :class="['relative', route.path === item.to ? 'text-[#16141C]' : 'text-white/80']"
      />
    </RouterLink>
    <button
      class="grid size-[54px] place-items-center rounded-full bg-primary text-white"
      aria-label="Nueva fuente"
      @click="ui.openNewSource()"
    >
      <PhPlus :size="25" weight="bold" />
    </button>
    <RouterLink
      v-for="item in items.slice(2)"
      :key="item.to"
      :to="item.to"
      :aria-label="item.label"
      class="relative grid size-[54px] place-items-center rounded-full"
    >
      <motion.span
        v-if="route.path === item.to"
        layout-id="nav-active"
        class="absolute inset-0 rounded-full bg-white"
        :transition="spring.card"
      />
      <component
        :is="item.icon"
        :size="25"
        :weight="route.path === item.to ? 'fill' : 'bold'"
        :class="['relative', route.path === item.to ? 'text-[#16141C]' : 'text-white/80']"
      />
    </RouterLink>
  </nav>
</template>
