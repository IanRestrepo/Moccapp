<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { PhArrowRight, PhCaretRight, PhMoon, PhPlus, PhSpeakerHigh, PhSpeakerSlash, PhSun } from '@phosphor-icons/vue'
import { EXAM_LEVEL_LABELS, type ExamHistoryItemDTO, type SourceDTO } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import StickerIcon from '@/components/StickerIcon.vue'
import SourceFolder from '@/components/SourceFolder.vue'
import { useSourcesStore } from '@/stores/sources'
import { useStatsStore } from '@/stores/stats'
import { useUiStore } from '@/stores/ui'
import { useSound } from '@/composables/useSound'
import { useTheme } from '@/composables/useTheme'
import { longDate, relativeDay, scoreBg, scoreText, weekdayShort } from '@/lib/format'
import { api } from '@/api/client'

const router = useRouter()
const ui = useUiStore()
const sources = useSourcesStore()
const statsStore = useStatsStore()
const sound = useSound()
const theme = useTheme()
const loadError = ref<string | null>(null)

onMounted(async () => {
  try {
    await Promise.all([sources.fetchAll(), statsStore.refresh()])
    if (statsStore.stats) sound.syncFromServer(statsStore.stats.soundEnabled)
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'No pude cargar tus datos.'
  }
})

const stats = computed(() => statsStore.stats)
const ready = computed(() => sources.list.filter((s) => s.status === 'ready'))
const lastSourceTitle = computed(() => statsStore.recent[0]?.sourceTitle.split(/[:,(—]/)[0]?.trim())
const studying = computed(() => sources.list.some((s) => s.status === 'processing'))

function openSource(s: SourceDTO) {
  if (s.status === 'ready') return router.push({ path: '/configurar', query: { source: s.id } })
  if (s.status === 'error') return api.retrySource(s.id).then(sources.upsert)
}

function openExam(e: ExamHistoryItemDTO) {
  router.push(e.status === 'in_progress' ? `/examen/${e.id}` : `/resultados/${e.id}`)
}

function startExam() {
  if (!ready.value.length) return ui.openNewSource()
  router.push(ready.value.length === 1 ? { path: '/configurar', query: { source: ready.value[0]!.id } } : '/configurar')
}
</script>

<template>
  <main class="mx-auto max-w-[440px] px-4 pb-32 pt-5">
    <header class="flex items-center justify-between">
      <p class="flex items-center gap-2 text-[15px] font-semibold text-ink-2">
        <span class="size-2 rounded-full bg-orange" />
        {{ longDate() }}
      </p>
      <div class="flex gap-2">
        <button
          class="grid size-11 place-items-center rounded-full bg-surface ring-1 ring-line"
          :aria-label="sound.enabled.value ? 'Silenciar sonidos' : 'Activar sonidos'"
          :aria-pressed="!sound.enabled.value"
          @click="sound.toggle()"
        >
          <component :is="sound.enabled.value ? PhSpeakerHigh : PhSpeakerSlash" :size="20" weight="bold" />
        </button>
        <button class="grid size-11 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Cambiar tema" @click="theme.toggle()">
          <component :is="theme.isDark.value ? PhSun : PhMoon" :size="20" weight="bold" />
        </button>
      </div>
    </header>

    <div class="mt-5 flex items-end justify-between">
      <h1 class="text-mega font-extrabold">Hoy</h1>
      <RouterLink
        v-if="stats"
        to="/premios"
        class="mb-1 flex h-11 items-center gap-1.5 rounded-full bg-yellow pl-2 pr-4 font-display text-[17px] font-extrabold text-on-color"
        :aria-label="`${stats.bones} huesitos: ver premios`"
      >
        <StickerIcon name="bone" :size="26" :tilt="-18" /> {{ stats.bones.toLocaleString('es-CO') }}
      </RouterLink>
    </div>

    <!-- frase editorial con stickers (referencia "Today") -->
    <p v-if="stats" class="mt-4 font-display text-lede font-semibold text-ink-3">
      <template v-if="stats.currentStreak > 0">
        Llevas <span class="text-ink">{{ stats.currentStreak }} {{ stats.currentStreak === 1 ? 'día' : 'días' }}</span>
        <StickerIcon name="flame" :size="30" :tilt="8" />
        estudiando seguido,
      </template>
      <template v-else>
        Hoy es buen día para empezar
        <StickerIcon name="flame" :size="30" :tilt="8" />,
      </template>
      te faltan <span class="text-ink">{{ stats.xpForNextLevel - stats.xpIntoLevel }} XP</span>
      <StickerIcon name="star" :size="26" :tilt="-10" />
      para el nivel {{ stats.level + 1 }}<template v-if="lastSourceTitle">
        y lo último fue <span class="text-ink">{{ lastSourceTitle }}</span>
        <StickerIcon name="capsule" :size="30" /></template
      >.
    </p>
    <div v-else-if="!loadError" class="mt-4 space-y-2" aria-hidden="true">
      <div v-for="w in [95, 80, 60]" :key="w" class="h-7 animate-pulse rounded-full bg-ink/8" :style="{ width: `${w}%` }" />
    </div>
    <p v-if="loadError" class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ loadError }}</p>

    <!-- Bloque principal (referencia "Daily challenge") -->
    <section class="relative mt-7 rounded-card-lg bg-lilac p-6 pr-36 text-on-color">
      <h2 class="text-title font-extrabold">Nuevo examen</h2>
      <p class="mt-2 text-[15px] font-medium leading-snug opacity-75">
        {{ ready.length ? 'Elige una fuente, el tiempo y la dificultad.' : 'Primero sube tus apuntes, un PDF o un video.' }}
      </p>
      <BaseButton class="mt-5" size="md" @click="startExam">
        {{ ready.length ? 'Empezar' : 'Subir fuente' }}
        <PhArrowRight :size="18" weight="bold" />
      </BaseButton>
      <MascotBlob class="pointer-events-none absolute -top-9 right-1" :mood="studying ? 'thinking' : 'happy'" :size="138" />
      <StickerIcon class="absolute bottom-5 right-4" name="bone" :size="34" :tilt="14" />
    </section>

    <!-- Semana -->
    <ol v-if="stats" class="mt-4 grid grid-cols-7 gap-1.5" aria-label="Racha de la semana">
      <li
        v-for="(day, i) in stats.week"
        :key="day.date"
        :class="['flex flex-col items-center gap-1.5 rounded-full pb-3 pt-2.5', i === 6 ? 'bg-night text-white' : 'text-ink-2 ring-1 ring-line']"
        :aria-label="`${day.date}${day.active ? ', estudiaste' : ''}`"
      >
        <span :class="['size-1.5 rounded-full', day.active ? (i === 6 ? 'bg-yellow' : 'bg-ink') : 'bg-transparent']" />
        <span class="text-[13px] font-medium">{{ weekdayShort(day.date) }}</span>
        <span :class="['font-display text-[17px] font-bold', i !== 6 && 'text-ink']">{{ Number(day.date.slice(8)) }}</span>
      </li>
    </ol>

    <!-- Fuentes -->
    <div class="mt-10 flex items-center justify-between">
      <h2 class="text-title font-extrabold">Tus fuentes</h2>
      <div class="flex items-center gap-3">
        <RouterLink v-if="sources.list.length > 4" to="/fuentes" class="text-[15px] font-semibold text-ink-2 underline-offset-2 hover:underline">
          Ver las {{ sources.list.length }}
        </RouterLink>
        <span v-else-if="sources.list.length" class="text-[15px] font-semibold text-ink-2">
          {{ sources.list.length }} {{ sources.list.length === 1 ? 'carpeta' : 'carpetas' }}
        </span>
        <button class="grid size-10 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Agregar fuente" @click="ui.openNewSource()">
          <PhPlus :size="18" weight="bold" />
        </button>
      </div>
    </div>

    <div v-if="sources.list.length" class="mt-5 grid grid-cols-2 gap-x-3 gap-y-4">
      <SourceFolder v-for="s in sources.list.slice(0, 4)" :key="s.id" :source="s" @click="openSource(s)" />
    </div>
    <button
      v-else-if="sources.loaded"
      class="mt-5 flex w-full flex-col items-center rounded-card border-[2.5px] border-dashed border-ink/15 px-6 py-8 text-center"
      @click="ui.openNewSource()"
    >
      <MascotBlob mood="surprised" :size="96" />
      <span class="mt-3 font-display text-[19px] font-bold">Todavía no hay fuentes</span>
      <span class="mt-1 text-[14px] font-medium text-ink-2">Sube un PDF, una foto de tus apuntes o un video de YouTube.</span>
    </button>

    <!-- Últimos exámenes -->
    <template v-if="statsStore.recent.length">
      <div class="mt-10 flex items-center justify-between">
        <h2 class="text-title font-extrabold">Últimos</h2>
        <RouterLink to="/historial" class="text-[15px] font-semibold text-ink-2 underline-offset-2 hover:underline">Ver todo</RouterLink>
      </div>
      <ul class="mt-4 flex flex-col gap-2.5">
        <li v-for="e in statsStore.recent" :key="e.id">
          <button class="flex w-full items-center gap-4 rounded-[24px] bg-surface p-3 pr-4 text-left ring-1 ring-line" @click="openExam(e)">
            <span
              :class="[
                'grid size-14 shrink-0 place-items-center rounded-[18px] font-display text-[22px] font-extrabold',
                e.score !== null ? [scoreBg(e.score), 'text-on-color'] : 'bg-surface-2 text-ink',
              ]"
            >
              {{ e.score !== null ? scoreText(e.score) : '…' }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-display text-[17px] font-bold">{{ e.sourceTitle }}</span>
              <span class="block text-[13px] font-medium text-ink-2">
                {{ e.status === 'in_progress' ? 'En curso · toca para seguir' : `${relativeDay(e.createdAt)} · ${EXAM_LEVEL_LABELS[e.level]} · ${e.questionCount} preguntas` }}
              </span>
            </span>
            <PhCaretRight :size="18" weight="bold" class="text-ink-3" />
          </button>
        </li>
      </ul>
    </template>
  </main>
</template>
