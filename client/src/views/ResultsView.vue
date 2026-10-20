<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { motion } from 'motion-v'
import confetti from 'canvas-confetti'
import { PhArrowsClockwise, PhHouse, PhLightning, PhRepeat, PhTarget, PhTimer } from '@phosphor-icons/vue'
import { EXAM_LEVEL_LABELS, type ExamResultDTO } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import BasePill from '@/components/ui/BasePill.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import StickerIcon from '@/components/StickerIcon.vue'
import ReviewItem from '@/components/results/ReviewItem.vue'
import PerfectCelebration from '@/components/results/PerfectCelebration.vue'
import { api, ApiRequestError } from '@/api/client'
import { duration, scoreText } from '@/lib/format'
import { spring } from '@/lib/motion'
import { useExamStore } from '@/stores/exam'
import { useStatsStore } from '@/stores/stats'
import { useCountUp } from '@/composables/useCountUp'
import { useSound } from '@/composables/useSound'

const route = useRoute()
const router = useRouter()
const examStore = useExamStore()
const statsStore = useStatsStore()
const sound = useSound()
const id = route.params.id as string

const result = ref<ExamResultDTO | null>(null)
const pending = ref(false) // las abiertas quedaron sin corregir (Gemini ocupado)
const error = ref<string | null>(null)
const busy = ref<string | null>(null)
const filter = ref<'all' | 'failed'>('all')
/** 100 %: celebración especial a pantalla completa (solo la primera vez que se ve el resultado) */
const perfectOpen = ref(false)
const perfect = computed(() => result.value?.percent === 100)

const score = useCountUp()
const xp = useCountUp()

onMounted(load)

async function load() {
  error.value = null
  try {
    const cached = examStore.lastResult?.id === id ? examStore.lastResult : null
    const dto = cached ?? (await api.getExam(id))
    if (dto.status === 'in_progress') return void router.replace(`/examen/${id}`)
    if (dto.status === 'grading') return void (pending.value = true)
    show(dto)
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude cargar el resultado.'
  }
}

function show(dto: ExamResultDTO) {
  pending.value = false
  result.value = dto
  if (dto.percent === 100 && examStore.lastResult?.id === dto.id && !celebrated.has(dto.id)) {
    celebrated.add(dto.id)
    perfectOpen.value = true // el sonido y el confetti los pone la celebración
    return
  }
  revealScore(dto)
}

/** Ya se celebró este examen en esta sesión: al volver a abrirlo no se repite la fiesta */
const celebrated = (window as unknown as { __vqCelebrated?: Set<string> }).__vqCelebrated ??= new Set<string>()

function revealScore(dto: ExamResultDTO, quiet = false) {
  score.run(dto.score, 1300, 250)
  xp.run(dto.xpEarned, 1100, 700)
  if (quiet) return
  sound.play(dto.passed ? 'finish' : 'wrong')
  if (dto.passed) celebrate()
}

/** Confetti con la paleta de la app (respeta "reducir movimiento" del sistema) */
function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const colors = ['#ffcf3f', '#ff9b45', '#ab90f7', '#ff86c3', '#59d394', '#7fb4ff']
  const burst = (x: number, angle: number) =>
    confetti({ particleCount: 70, spread: 70, startVelocity: 48, angle, origin: { x, y: 0.75 }, colors, scalar: 1.1, disableForReducedMotion: true })
  setTimeout(() => (burst(0.1, 60), burst(0.9, 120)), 350)
  if (result.value && result.value.score >= 4.5) setTimeout(() => confetti({ particleCount: 120, spread: 120, origin: { y: 0.35 }, colors }), 900)
}

async function regrade() {
  busy.value = 'regrade'
  error.value = null
  try {
    const dto = await api.regradeExam(id)
    if (dto.status === 'completed') {
      examStore.setResult(dto)
      statsStore.refresh().catch(() => {})
      show(dto)
    }
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'Todavía no se pudo corregir. Intenta en un minuto.'
  } finally {
    busy.value = null
  }
}

async function again(kind: 'failed' | 'repeat') {
  busy.value = kind
  error.value = null
  try {
    const res = kind === 'failed' ? await api.retryFailed(id) : await api.repeatExam(id)
    examStore.setActive(res.exam, res.shortBy)
    router.push(`/examen/${res.exam.id}`)
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No se pudo armar el examen.'
    busy.value = null
  }
}

function closePerfect() {
  perfectOpen.value = false
  if (result.value) revealScore(result.value, true)
}

const headline = computed(() => {
  const s = result.value?.score ?? 0
  if (perfect.value) return '¡Perfecto!'
  return s >= 4.5 ? '¡Lo lograste!' : s >= 4 ? '¡Muy bien!' : s >= 3 ? '¡Aprobaste!' : '¡Casi!'
})
const items = computed(() => (filter.value === 'failed' ? result.value?.items.filter((i) => i.credit < 1) : result.value?.items) ?? [])
const scoreColor = computed(() => {
  const s = result.value?.score ?? 0
  return s >= 4 ? 'bg-mint' : s >= 3 ? 'bg-yellow' : 'bg-pink'
})
</script>

<template>
  <main class="mx-auto max-w-[560px] px-4 pb-16 pt-5">
    <!-- Corrección pendiente -->
    <section v-if="pending" class="flex min-h-[80dvh] flex-col items-center justify-center text-center">
      <MascotBlob mood="thinking" :size="140" />
      <h1 class="mt-5 text-title font-extrabold">Tus respuestas están guardadas</h1>
      <p class="mt-2 max-w-[340px] text-[15px] font-medium text-ink-2">
        La IA estaba ocupada y no alcanzó a corregir las respuestas abiertas. No pierdes nada: dale a corregir en un momento.
      </p>
      <p v-if="error" class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>
      <BaseButton class="mt-6" size="xl" :loading="busy === 'regrade'" @click="regrade">
        <PhArrowsClockwise :size="20" weight="bold" /> Corregir de nuevo
      </BaseButton>
      <BaseButton class="mt-2" variant="ghost" size="md" @click="router.push('/')">Volver a Inicio</BaseButton>
    </section>

    <template v-else-if="result">
      <PerfectCelebration
        :open="perfectOpen"
        :xp="result.xpEarned"
        :streak="result.streak.current"
        :time-sec="result.timeUsedSec"
        :limit-sec="result.timeLimitSec"
        :bones="result.bonesEarned"
        @close="closePerfect"
      />
      <!-- Hero -->
      <section class="relative overflow-hidden rounded-card-lg px-6 pb-7 pt-6 text-center text-on-color" :class="scoreColor">
        <StickerIcon class="absolute left-5 top-6" name="star" :size="30" :tilt="-12" />
        <StickerIcon class="absolute right-6 top-24" name="paw" :size="30" :tilt="18" />
        <StickerIcon v-if="result.passed" class="absolute bottom-24 left-6" name="bone" :size="34" :tilt="-20" />
        <MascotBlob class="mx-auto" :mood="perfect ? 'proud' : result.passed ? 'celebrating' : 'sad'" :size="150" />
        <h1 class="mt-2 text-mega font-extrabold">{{ headline }}</h1>
        <p class="mt-1 text-[15px] font-semibold opacity-75">{{ result.sourceTitle }} · {{ EXAM_LEVEL_LABELS[result.level] }}</p>

        <motion.div
          class="mx-auto mt-5 inline-flex items-baseline rounded-[28px] bg-white/70 px-7 py-3"
          :initial="{ scale: 0.6, opacity: 0 }"
          :animate="{ scale: 1, opacity: 1 }"
          :transition="{ ...spring.jelly, delay: 0.15 }"
        >
          <span class="font-display-tight text-[76px] font-extrabold leading-none tabular-nums">{{ scoreText(score.value.value) }}</span>
          <span class="ml-1 font-display text-[22px] font-bold opacity-60">/ 5,0</span>
        </motion.div>
        <p class="mx-auto mt-4 max-w-[320px] font-display text-[17px] font-semibold">{{ result.motivation }}</p>
      </section>

      <!-- Datos -->
      <div class="mt-3 grid grid-cols-3 gap-2">
        <div class="rounded-[22px] bg-surface p-3.5 ring-1 ring-line">
          <PhTarget :size="20" weight="bold" class="text-ink-3" />
          <p class="mt-1.5 font-display text-[22px] font-extrabold tabular-nums">{{ Math.round(result.percent) }}%</p>
          <p class="text-[12px] font-semibold text-ink-2">de acierto</p>
        </div>
        <div class="rounded-[22px] bg-surface p-3.5 ring-1 ring-line">
          <PhTimer :size="20" weight="bold" class="text-ink-3" />
          <p class="mt-1.5 font-display text-[22px] font-extrabold tabular-nums">{{ duration(result.timeUsedSec) }}</p>
          <p class="text-[12px] font-semibold text-ink-2">{{ result.autoSubmitted ? 'se acabó el tiempo' : `de ${duration(result.timeLimitSec)}` }}</p>
        </div>
        <div class="rounded-[22px] bg-night p-3.5 text-white">
          <PhLightning :size="20" weight="fill" class="text-yellow" />
          <p class="mt-1.5 font-display text-[22px] font-extrabold tabular-nums">+{{ Math.round(xp.value.value) }}</p>
          <p class="text-[12px] font-semibold opacity-70">XP ganada</p>
        </div>
      </div>
      <p class="mt-3 flex items-center justify-center gap-1.5 text-[14px] font-semibold text-ink-2">
        <StickerIcon name="flame" :size="22" />
        Racha de {{ result.streak.current }} {{ result.streak.current === 1 ? 'día' : 'días' }}{{ result.streak.extendedToday ? ' · ¡sumaste hoy!' : '' }}
      </p>
      <RouterLink
        to="/premios"
        class="mx-auto mt-3 flex w-fit items-center gap-1.5 rounded-full bg-yellow-tint px-4 py-2 text-[14px] font-bold"
      >
        <StickerIcon name="bone" :size="22" :tilt="-18" /> +{{ result.bonesEarned }} huesitos para premios
      </RouterLink>

      <!-- Acciones -->
      <p v-if="error" role="alert" class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>
      <div class="mt-5 grid gap-2">
        <BaseButton v-if="result.failedCount" variant="primary" size="xl" block :loading="busy === 'failed'" @click="again('failed')">
          Repasar las que fallé ({{ result.failedCount }})
        </BaseButton>
        <div class="grid grid-cols-2 gap-2">
          <BaseButton variant="surface" size="lg" :loading="busy === 'repeat'" @click="again('repeat')">
            <PhRepeat :size="18" weight="bold" /> Otro examen
          </BaseButton>
          <BaseButton variant="surface" size="lg" @click="router.push('/')">
            <PhHouse :size="18" weight="bold" /> Inicio
          </BaseButton>
        </div>
      </div>

      <!-- Revisión -->
      <div class="mt-10 flex items-center justify-between">
        <h2 class="text-title font-extrabold">Revisión</h2>
        <div class="flex gap-1.5" role="radiogroup" aria-label="Filtrar preguntas">
          <BasePill size="sm" :selected="filter === 'all'" @click="filter = 'all'">Todas</BasePill>
          <BasePill size="sm" :selected="filter === 'failed'" @click="filter = 'failed'">Falladas</BasePill>
        </div>
      </div>
      <div class="mt-4 flex flex-col gap-3">
        <ReviewItem v-for="it in items" :key="it.questionId" :item="it" />
        <p v-if="!items.length" class="rounded-card bg-surface p-6 text-center font-display text-[18px] font-bold ring-1 ring-line">
          ¡No fallaste ninguna! 🎉
        </p>
      </div>
    </template>

    <p v-else-if="error" class="mt-10 rounded-[20px] bg-pink-tint px-4 py-3 text-center text-[15px] font-semibold">{{ error }}</p>
    <div v-else class="flex min-h-[80dvh] items-center justify-center"><MascotBlob mood="thinking" :size="120" /></div>
  </main>
</template>
