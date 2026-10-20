<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { PhCaretRight, PhRepeat } from '@phosphor-icons/vue'
import { EXAM_LEVEL_LABELS, type ExamHistoryItemDTO } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import { api, ApiRequestError } from '@/api/client'
import { duration, relativeDay, scoreBg, scoreText } from '@/lib/format'
import { useStatsStore } from '@/stores/stats'

const router = useRouter()
const statsStore = useStatsStore()
const exams = ref<ExamHistoryItemDTO[]>([])
const cursor = ref<string | null>(null)
const loaded = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)

async function load(more = false) {
  loadingMore.value = more
  try {
    const page = await api.history({ limit: 20, cursor: more ? (cursor.value ?? undefined) : undefined })
    exams.value = more ? [...exams.value, ...page.exams] : page.exams
    cursor.value = page.nextCursor
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude cargar el historial.'
  } finally {
    loaded.value = true
    loadingMore.value = false
  }
}
onMounted(() => {
  load()
  if (!statsStore.stats) statsStore.refresh().catch(() => {})
})

/** Agrupado por día: Hoy, Ayer, 12 oct… */
const groups = computed(() => {
  const map = new Map<string, ExamHistoryItemDTO[]>()
  for (const e of exams.value) {
    const k = relativeDay(e.createdAt)
    map.set(k, [...(map.get(k) ?? []), e])
  }
  return [...map]
})

const open = (e: ExamHistoryItemDTO) => router.push(e.status === 'in_progress' ? `/examen/${e.id}` : `/resultados/${e.id}`)
</script>

<template>
  <main class="mx-auto max-w-[440px] px-4 pb-32 pt-5">
    <h1 class="text-mega font-extrabold">Historial</h1>

    <div v-if="statsStore.stats" class="mt-6 grid grid-cols-3 gap-2">
      <div class="rounded-[22px] bg-yellow p-3.5 text-on-color">
        <p class="font-display text-[26px] font-extrabold">{{ statsStore.stats.examsCompleted }}</p>
        <p class="text-[12.5px] font-semibold opacity-70">exámenes</p>
      </div>
      <div class="rounded-[22px] bg-orange p-3.5 text-on-color">
        <p class="font-display text-[26px] font-extrabold">{{ statsStore.stats.longestStreak }}</p>
        <p class="text-[12.5px] font-semibold opacity-70">mejor racha</p>
      </div>
      <div class="rounded-[22px] bg-lilac p-3.5 text-on-color">
        <p class="font-display text-[26px] font-extrabold">{{ statsStore.stats.totalXp }}</p>
        <p class="text-[12.5px] font-semibold opacity-70">XP · nivel {{ statsStore.stats.level }}</p>
      </div>
    </div>

    <p v-if="error" class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>

    <section v-for="[day, list] in groups" :key="day" class="mt-8">
      <h2 class="px-1 text-[15px] font-bold text-ink-2">{{ day }}</h2>
      <ul class="mt-2.5 flex flex-col gap-2.5">
        <li v-for="e in list" :key="e.id">
          <button class="flex w-full items-center gap-4 rounded-[24px] bg-surface p-3 pr-4 text-left ring-1 ring-line" @click="open(e)">
            <span
              :class="[
                'grid size-14 shrink-0 place-items-center rounded-[18px] font-display text-[22px] font-extrabold',
                e.score !== null ? [scoreBg(e.score), 'text-on-color'] : 'bg-surface-2',
              ]"
            >
              {{ e.score !== null ? scoreText(e.score) : '…' }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1.5">
                <span class="truncate font-display text-[17px] font-bold">{{ e.sourceTitle }}</span>
                <PhRepeat v-if="e.mode === 'retry_failed'" :size="15" weight="bold" class="shrink-0 text-ink-3" aria-label="Repaso de falladas" />
              </span>
              <span class="block text-[13px] font-medium text-ink-2">
                <template v-if="e.status === 'in_progress'">En curso · toca para seguir</template>
                <template v-else-if="e.status === 'grading'">Corrección pendiente</template>
                <template v-else>
                  {{ EXAM_LEVEL_LABELS[e.level] }} · {{ e.questionCount }} preguntas<template v-if="e.timeUsedSec"> · {{ duration(e.timeUsedSec) }}</template>
                </template>
              </span>
            </span>
            <PhCaretRight :size="18" weight="bold" class="text-ink-3" />
          </button>
        </li>
      </ul>
    </section>

    <BaseButton v-if="cursor" class="mt-6" variant="surface" size="lg" block :loading="loadingMore" @click="load(true)">Ver más</BaseButton>

    <div v-if="loaded && !exams.length && !error" class="mt-10 flex flex-col items-center text-center">
      <MascotBlob mood="happy" :size="120" />
      <p class="mt-4 font-display text-[20px] font-bold">Aún no hay exámenes</p>
      <p class="mt-1 text-[14px] font-medium text-ink-2">Cuando presentes el primero, aparece aquí. Sin límites.</p>
      <BaseButton class="mt-5" size="lg" @click="router.push('/configurar')">Hacer un examen</BaseButton>
    </div>
  </main>
</template>
