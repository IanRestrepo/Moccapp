<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AnimatePresence, motion } from 'motion-v'
import { PhDotsThreeVertical, PhFolderSimplePlus, PhFolderSimple, PhPlus, PhTrash } from '@phosphor-icons/vue'
import type { SourceDTO } from '@vetquiz/shared'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import SourceFolder from '@/components/SourceFolder.vue'
import CollectionFolder from '@/components/collections/CollectionFolder.vue'
import CollectionSheet from '@/components/collections/CollectionSheet.vue'
import MoveToSheet from '@/components/collections/MoveToSheet.vue'
import { useCollectionsStore } from '@/stores/collections'
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

const collections = useCollectionsStore()
onMounted(() => {
  sources.fetchAll().catch((e: Error) => (error.value = e.message))
  collections.fetchAll().catch(() => {})
})

// Carpetas grandes arriba; abajo, las fuentes que no están en ninguna (si no hay carpetas, todas)
const loose = computed(() => sources.list.filter((s) => !collections.ofSource.has(s.id)))
const creating = ref(false)
const moving = ref<SourceDTO | null>(null)
function moveSource(s: SourceDTO) {
  menuFor.value = null
  moving.value = s
}

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
        <span class="text-[15px] font-semibold text-ink-2">{{ sources.list.length }} {{ sources.list.length === 1 ? 'fuente' : 'fuentes' }}</span>
        <button class="grid size-11 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Agregar fuente" @click="ui.openNewSource()">
          <PhPlus :size="20" weight="bold" />
        </button>
      </div>
    </div>

    <p v-if="error" class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>

    <!-- Carpetas grandes (las arma ella) -->
    <section v-if="sources.list.length" class="mt-7">
      <div class="flex items-center justify-between">
        <h2 class="text-[22px] font-bold">Carpetas</h2>
        <button class="flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[13.5px] font-bold ring-1 ring-line" @click="creating = true">
          <PhFolderSimplePlus :size="18" weight="bold" /> Nueva carpeta
        </button>
      </div>
      <div v-if="collections.list.length" class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CollectionFolder
          v-for="c in collections.list"
          :key="c.id"
          :collection="c"
          :sources="sources.list"
          @click="router.push(`/carpeta/${c.id}`)"
        />
      </div>
      <button
        v-else
        class="mt-3 flex w-full items-center gap-3 rounded-[22px] border-[2.5px] border-dashed border-ink/15 p-4 text-left"
        @click="creating = true"
      >
        <PhFolderSimple :size="28" weight="duotone" class="shrink-0 text-lilac" />
        <span>
          <span class="block font-display text-[16px] font-bold">Agrupa tus fuentes por materia</span>
          <span class="block text-[13px] font-medium text-ink-2">Ej: «BIOQUÍMICA SEMESTRE 2» con todas sus presentaciones.</span>
        </span>
      </button>
    </section>

    <h2 v-if="collections.list.length && loose.length" class="mt-9 text-[22px] font-bold">Sin carpeta</h2>
    <div v-if="loose.length" :class="['grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3', collections.list.length ? 'mt-4' : 'mt-7']">
      <div v-for="s in loose" :key="s.id" class="relative">
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
            class="absolute inset-x-1 top-10 z-10 rounded-[20px] bg-surface p-1.5 shadow-float ring-1 ring-line"
            :initial="{ opacity: 0, scale: 0.9, y: -6 }"
            :animate="{ opacity: 1, scale: 1, y: 0 }"
            :exit="{ opacity: 0, scale: 0.9 }"
            :transition="spring.press"
          >
            <button
              class="flex w-full items-center gap-2 rounded-[14px] px-3 py-2.5 text-left text-[14px] font-bold hover:bg-surface-2"
              @click.stop="moveSource(s)"
            >
              <PhFolderSimple :size="18" weight="bold" /> Mover a carpeta
            </button>
            <button
              v-if="s.mine"
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

    <p v-else-if="sources.list.length" class="mt-6 text-center text-[14px] font-medium text-ink-2">Todas tus fuentes están en carpetas.</p>

    <button
      v-else-if="sources.loaded"
      class="mt-8 flex w-full flex-col items-center rounded-card border-[2.5px] border-dashed border-ink/15 px-6 py-10 text-center"
      @click="ui.openNewSource()"
    >
      <MascotBlob mood="surprised" :size="110" />
      <span class="mt-3 font-display text-[20px] font-bold">Aquí van tus carpetas</span>
      <span class="mt-1 text-[14px] font-medium text-ink-2">Sube tu primer PDF, foto de apuntes o video.</span>
    </button>
    <CollectionSheet :open="creating" @close="creating = false" @created="(id) => router.push(`/carpeta/${id}`)" />
    <MoveToSheet :source="moving" @close="moving = null" />
  </main>
</template>
