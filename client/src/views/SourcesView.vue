<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AnimatePresence, motion } from 'motion-v'
import { PhDotsThreeVertical, PhPlus, PhTrash } from '@phosphor-icons/vue'
import type { SourceDTO } from '@vetquiz/shared'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import SourceFolder from '@/components/SourceFolder.vue'
import { api } from '@/api/client'
import { spring } from '@/lib/motion'
import { useSourcesStore } from '@/stores/sources'
import { useUiStore } from '@/stores/ui'

const router = useRouter()
const sources = useSourcesStore()
const ui = useUiStore()
const menuFor = ref<string | null>(null)
const confirming = ref(false)
const error = ref<string | null>(null)

onMounted(() => sources.fetchAll().catch((e: Error) => (error.value = e.message)))

function open(s: SourceDTO) {
  if (menuFor.value) return void (menuFor.value = null)
  if (s.status === 'ready') router.push({ path: '/configurar', query: { source: s.id } })
  else if (s.status === 'error') api.retrySource(s.id).then(sources.upsert)
}

function toggleMenu(id: string) {
  confirming.value = false
  menuFor.value = menuFor.value === id ? null : id
}

/** Borrar pide un segundo toque: borra también el banco y los exámenes de esa fuente */
async function remove(id: string) {
  if (!confirming.value) return void (confirming.value = true)
  try {
    await api.deleteSource(id)
    sources.remove(id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo borrar.'
  }
  menuFor.value = null
}
</script>

<template>
  <main class="mx-auto max-w-[440px] px-4 pb-32 pt-5 sm:max-w-3xl">
    <div class="flex items-end justify-between">
      <h1 class="text-mega font-extrabold">Tus<br />fuentes</h1>
      <div class="flex items-center gap-3 pb-2">
        <span class="text-[15px] font-semibold text-ink-2">{{ sources.list.length }} carpetas</span>
        <button class="grid size-11 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Agregar fuente" @click="ui.openNewSource()">
          <PhPlus :size="20" weight="bold" />
        </button>
      </div>
    </div>

    <p v-if="error" class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>

    <div v-if="sources.list.length" class="mt-7 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
      <div v-for="s in sources.list" :key="s.id" class="relative">
        <SourceFolder :source="s" @click="open(s)" />
        <button
          class="absolute right-1 top-0 grid size-9 place-items-center rounded-full text-on-color/80 hover:bg-white/40"
          :aria-label="`Opciones de ${s.title}`"
          :aria-expanded="menuFor === s.id"
          @click.stop="toggleMenu(s.id)"
        >
          <PhDotsThreeVertical :size="22" weight="bold" />
        </button>
        <AnimatePresence>
          <motion.div
            v-if="menuFor === s.id"
            class="absolute right-1 top-10 z-10 w-48 rounded-[20px] bg-surface p-1.5 shadow-float ring-1 ring-line"
            :initial="{ opacity: 0, scale: 0.9, y: -6 }"
            :animate="{ opacity: 1, scale: 1, y: 0 }"
            :exit="{ opacity: 0, scale: 0.9 }"
            :transition="spring.press"
          >
            <button
              :class="[
                'flex w-full items-center gap-2 rounded-[14px] px-3 py-2.5 text-left text-[14px] font-bold',
                confirming ? 'bg-danger text-white' : 'text-danger hover:bg-pink-tint',
              ]"
              @click.stop="remove(s.id)"
            >
              <PhTrash :size="18" weight="bold" />
              {{ confirming ? '¿Segura? Toca otra vez' : 'Borrar fuente' }}
            </button>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>

    <button
      v-else-if="sources.loaded"
      class="mt-8 flex w-full flex-col items-center rounded-card border-[2.5px] border-dashed border-ink/15 px-6 py-10 text-center"
      @click="ui.openNewSource()"
    >
      <MascotBlob mood="surprised" :size="110" />
      <span class="mt-3 font-display text-[20px] font-bold">Aquí van tus carpetas</span>
      <span class="mt-1 text-[14px] font-medium text-ink-2">Sube tu primer PDF, foto de apuntes o video.</span>
    </button>
  </main>
</template>
