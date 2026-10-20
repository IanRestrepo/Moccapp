<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AnimatePresence, motion } from 'motion-v'
import {
  PhArrowLeft,
  PhArrowsLeftRight,
  PhCheck,
  PhCheckCircle,
  PhListBullets,
  PhMinus,
  PhPencilSimpleLine,
  PhPlus,
} from '@phosphor-icons/vue'
import {
  EXAM_LEVELS,
  EXAM_LEVEL_LABELS,
  LEVEL_TO_DIFFICULTY,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  suggestQuestionCount,
  type ExamLevel,
  type QuestionType,
  type SourceColor,
  type SourceDTO,
} from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import BasePill from '@/components/ui/BasePill.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import ProcessingMessages from '@/components/source/ProcessingMessages.vue'
import { api, ApiRequestError } from '@/api/client'
import { colorClasses, pressable, spring } from '@/lib/motion'
import { useSourcesStore } from '@/stores/sources'
import { useExamStore } from '@/stores/exam'
import { useSound } from '@/composables/useSound'

const router = useRouter()
const route = useRoute()
const sources = useSourcesStore()
const exams = useExamStore()
const sound = useSound()

onMounted(() => {
  if (!sources.loaded) sources.fetchAll().catch(() => {})
})

const ready = computed(() => sources.list.filter((s) => s.status === 'ready'))
/** Fuentes del examen: llega con ?source=id o ?sources=a,b,c (desde el popup) y se pueden sumar o quitar */
const fromQuery = [route.query.sources, route.query.source].flatMap((v) => (typeof v === 'string' ? v.split(',') : [])).filter(Boolean)
const selectedIds = ref<string[]>(fromQuery)
const selected = computed(() => selectedIds.value.map((id) => sources.byId.get(id)).filter((x): x is SourceDTO => !!x && x.status === 'ready'))
/** La primera elegida (para el color del encabezado); null = todavía no eligió ninguna */
const source = computed(() => selected.value[0])
// si llega sin fuente y solo hay una lista, se elige sola
watch(ready, (r) => {
  if (!selectedIds.value.length && r.length === 1) selectedIds.value = [r[0]!.id]
}, { immediate: true })
function toggleSource(id: string) {
  selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter((x) => x !== id) : [...selectedIds.value, id]
}
const bankTotal = computed(() => selected.value.reduce((a, x) => a + x.bank.total, 0))

const FORMAT_LABEL = { pdf: 'PDF', docx: 'DOC', pptx: 'PPT', image: 'FOTO', text: 'TXT', youtube: 'VID' } as const

const levelMeta: Record<ExamLevel, { color: SourceColor; hint: string }> = {
  easy: { color: 'mint', hint: 'Datos y definiciones' },
  medium: { color: 'sky', hint: 'Mecanismos' },
  hard: { color: 'orange', hint: 'Relacionar y analizar' },
  utp: { color: 'pink', hint: 'Casos y aplicación' },
}
const typeIcon = {
  multiple_choice: PhListBullets,
  true_false: PhCheckCircle,
  matching: PhArrowsLeftRight,
  short_answer: PhPencilSimpleLine,
}

const level = ref<ExamLevel>('utp')
const minutes = ref(30)
const types = ref<QuestionType[]>(['multiple_choice', 'true_false', 'matching', 'short_answer'])
const manualCount = ref<number | null>(null)

const autoCount = computed(() => suggestQuestionCount(minutes.value, types.value.length ? types.value : ['multiple_choice'], level.value))
const count = computed(() => manualCount.value ?? autoCount.value)
const atLevel = computed(() => selected.value.reduce((a, x) => a + x.bank.byDifficulty[LEVEL_TO_DIFFICULTY[level.value]], 0))

const ALL_TYPES: QuestionType[] = ['multiple_choice', 'true_false', 'matching', 'short_answer']
/** Mientras ella no toque los tipos, Fácil sugiere opción múltiple y V/F (emparejar y abiertas son más exigentes) */
const typesTouched = ref(false)
watch(level, (l) => {
  if (!typesTouched.value) types.value = l === 'easy' ? ['multiple_choice', 'true_false'] : [...ALL_TYPES]
})

function toggleType(t: QuestionType) {
  typesTouched.value = true
  types.value = types.value.includes(t) ? types.value.filter((x) => x !== t) : [...types.value, t]
}
/** Más preguntas de las que alcanzan en el tiempo: probablemente no termine */
const tooMany = computed(() => manualCount.value !== null && manualCount.value > autoCount.value)
function step(delta: number) {
  manualCount.value = Math.min(60, Math.max(3, count.value + delta))
}

// ── Crear el examen ──────────────────────────────────────────
const creating = ref(false)
/** Si tarda más de 1.5 s es porque el servidor está generando más preguntas: se muestra a Mocca */
const slow = ref(false)
const error = ref<string | null>(null)

async function start() {
  if (!source.value || !types.value.length || creating.value) return
  creating.value = true
  error.value = null
  const slowTimer = window.setTimeout(() => (slow.value = true), 1500)
  try {
    const res = await api.createExam({
      sourceIds: selected.value.map((x) => x.id),
      level: level.value,
      timeLimitMin: minutes.value,
      questionCount: manualCount.value ?? undefined,
      types: types.value,
    })
    exams.setActive(res.exam, res.shortBy)
    sound.play('finish')
    router.push(`/examen/${res.exam.id}`)
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No se pudo armar el examen. Intenta de nuevo.'
  } finally {
    clearTimeout(slowTimer)
    creating.value = false
    slow.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-[440px] px-4 pb-40 pt-5">
    <header class="flex items-center gap-3">
      <button class="grid size-11 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Volver" @click="router.back()">
        <PhArrowLeft :size="20" weight="bold" />
      </button>
    </header>

    <h1 class="mt-6 text-mega font-extrabold">Arma tu<br />examen</h1>

    <!-- Fuentes del examen: una o varias (el examen mezcla preguntas de todas) -->
    <h2 class="mt-8 flex items-baseline justify-between text-[22px] font-bold">
      {{ ready.length > 1 ? '¿De qué fuentes?' : 'Fuente' }}
      <span v-if="selected.length > 1" class="text-[14px] font-semibold text-ink-2">{{ selected.length }} elegidas · se mezclan</span>
    </h2>
    <div class="mt-3 flex flex-col gap-2">
      <motion.button
        v-for="s in ready"
        :key="s.id"
        type="button"
        role="checkbox"
        :aria-checked="selectedIds.includes(s.id)"
        v-bind="pressable"
        :class="[
          'flex items-center gap-3 rounded-[20px] p-2.5 pr-3 text-left transition-colors duration-150',
          selectedIds.includes(s.id) ? colorClasses[s.color].solid : 'bg-surface ring-1 ring-line',
        ]"
        @click="toggleSource(s.id)"
      >
        <span
          :class="[
            'grid size-9 shrink-0 place-items-center rounded-full font-display text-[10px] font-extrabold',
            selectedIds.includes(s.id) ? 'bg-night text-white' : 'bg-surface-2',
          ]"
        >
          <PhCheck v-if="selectedIds.includes(s.id)" :size="16" weight="bold" />
          <template v-else>{{ FORMAT_LABEL[s.format] }}</template>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-display text-[16px] font-bold">{{ s.title }}</span>
          <span class="text-[12.5px] font-semibold opacity-70">{{ s.bank.total }} preguntas</span>
        </span>
      </motion.button>
      <p v-if="sources.loaded && !ready.length" class="rounded-[20px] bg-surface p-4 text-[14px] font-medium text-ink-2 ring-1 ring-line">
        No tienes fuentes listas todavía. Sube una con el botón + de abajo.
      </p>
      <p v-else-if="ready.length > 1 && !selected.length" class="px-1 text-[13px] font-medium text-ink-2">
        Toca una o varias. Si eliges varias, el examen mezcla preguntas de todas.
      </p>
    </div>

    <template v-if="source">
    <!-- Dificultad -->
    <h2 class="mt-8 text-[22px] font-bold">Dificultad</h2>
    <div class="mt-3 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Dificultad">
      <motion.button
        v-for="l in EXAM_LEVELS"
        :key="l"
        type="button"
        role="radio"
        :aria-checked="level === l"
        v-bind="pressable"
        :class="[
          'relative flex min-h-[108px] flex-col justify-between gap-3 rounded-[24px] p-4 text-left transition-colors duration-150',
          level === l ? [colorClasses[levelMeta[l].color].solid, 'ring-[3px] ring-night ring-inset'] : 'bg-surface ring-1 ring-line',
        ]"
        @click="level = l"
      >
        <span
          :class="[
            'grid size-7 shrink-0 place-items-center rounded-full',
            level === l ? 'bg-night text-white' : colorClasses[levelMeta[l].color].bg,
          ]"
        >
          <PhCheck v-if="level === l" :size="15" weight="bold" />
        </span>
        <span>
          <span class="block font-display text-[19px] font-bold leading-none">{{ EXAM_LEVEL_LABELS[l] }}</span>
          <span :class="['mt-1 block text-[13px] font-medium', level === l ? 'opacity-70' : 'text-ink-2']">{{ levelMeta[l].hint }}</span>
        </span>
      </motion.button>
    </div>

    <!-- Tiempo -->
    <h2 class="mt-8 text-[22px] font-bold">Tiempo</h2>
    <div class="mt-3 rounded-card bg-surface p-5 ring-1 ring-line">
      <p class="flex items-baseline gap-1.5">
        <span class="font-display-tight text-[56px] font-extrabold leading-none tabular-nums">{{ minutes }}</span>
        <span class="text-[17px] font-semibold text-ink-2">minutos</span>
      </p>
      <input v-model.number="minutes" type="range" min="5" max="120" step="5" class="vq-range mt-5 w-full" aria-label="Minutos" />
      <div class="mt-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Tiempos rápidos">
        <BasePill v-for="m in [10, 20, 30, 60]" :key="m" size="sm" :selected="minutes === m" @click="minutes = m">{{ m }} min</BasePill>
      </div>
    </div>

    <!-- Cantidad -->
    <div class="mt-3 flex items-center justify-between rounded-card bg-surface p-3 pl-5 ring-1 ring-line">
      <div>
        <p class="font-display text-[17px] font-bold">Preguntas</p>
        <button v-if="manualCount !== null" class="text-[13px] font-semibold text-ink-2 underline underline-offset-2" @click="manualCount = null">
          Volver a automático ({{ autoCount }})
        </button>
        <p v-else class="text-[13px] font-medium text-ink-2">Calculado según el tiempo</p>
      </div>
      <div class="flex items-center gap-1 rounded-full bg-surface-2 p-1">
        <button class="grid size-10 place-items-center rounded-full bg-surface" aria-label="Menos preguntas" @click="step(-1)">
          <PhMinus :size="16" weight="bold" />
        </button>
        <span class="w-10 text-center font-display text-[20px] font-extrabold tabular-nums">{{ count }}</span>
        <button class="grid size-10 place-items-center rounded-full bg-surface" aria-label="Más preguntas" @click="step(1)">
          <PhPlus :size="16" weight="bold" />
        </button>
      </div>
    </div>

    <p v-if="tooMany" role="status" class="mt-2 rounded-[18px] bg-yellow-tint px-4 py-2.5 text-[13.5px] font-semibold">
      Con {{ minutes }} min alcanzan unas {{ autoCount }}. Con {{ count }} puede que no termines: sube el tiempo o baja la cantidad.
    </p>

    <!-- Tipos -->
    <h2 class="mt-8 text-[22px] font-bold">Tipos de pregunta</h2>
    <p v-if="level === 'easy' && !typesTouched" class="mt-1 text-[13px] font-medium text-ink-2">
      En Fácil sugerimos opción múltiple y V/F. Puedes sumar las otras.
    </p>
    <div class="mt-3 grid grid-cols-2 gap-2.5">
      <motion.button
        v-for="t in QUESTION_TYPES"
        :key="t"
        type="button"
        role="checkbox"
        :aria-checked="types.includes(t)"
        v-bind="pressable"
        :class="[
          'flex items-center gap-3 rounded-[20px] p-3.5 text-left text-[14px] font-bold transition-colors duration-150',
          types.includes(t) ? 'bg-night text-white' : 'bg-surface text-ink ring-1 ring-line',
        ]"
        @click="toggleType(t)"
      >
        <component :is="typeIcon[t]" :size="22" weight="bold" class="shrink-0" />
        <span class="leading-tight">{{ QUESTION_TYPE_LABELS[t] }}</span>
      </motion.button>
    </div>

    <p class="mt-6 px-1 text-[13px] font-medium text-ink-2">
      {{ selected.length > 1 ? `Entre las ${selected.length} fuentes hay` : 'El banco tiene' }} {{ bankTotal }} preguntas ({{ atLevel }} del nivel {{ EXAM_LEVEL_LABELS[level] }}). Si faltan, Mocca hace más.
    </p>
    <p v-if="error" role="alert" class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>
    </template>

    <!-- CTA fijo -->
    <div class="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg from-60% to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-8">
      <div class="mx-auto max-w-[440px]">
        <BaseButton variant="primary" size="xl" block :disabled="!source || !types.length" :loading="creating && !slow" @click="start">
          Empezar · {{ count }} preguntas
        </BaseButton>
      </div>
    </div>

    <!-- Espera larga: el servidor está generando más preguntas con IA -->
    <AnimatePresence>
      <motion.div
        v-if="slow"
        class="fixed inset-0 z-40 flex flex-col items-center justify-center bg-bg/95 px-8 text-center backdrop-blur-sm"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="spring.card"
        role="status"
      >
        <MascotBlob mood="thinking" :size="150" />
        <p class="mt-5 font-display text-[24px] font-extrabold leading-tight">Mocca está preparando<br />preguntas nuevas</p>
        <ProcessingMessages class="mt-2" />
        <p class="mt-4 max-w-[300px] text-[13px] font-medium text-ink-2">Pasa cuando el banco no tiene suficientes de este nivel. Puede tardar unos minutos.</p>
      </motion.div>
    </AnimatePresence>
  </main>
</template>

<style scoped>
.vq-range {
  appearance: none;
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--vq-night) 0 calc((v-bind(minutes) - 5) / 115 * 100%),
    var(--vq-surface-2) 0
  );
}
:root[data-theme='dark'] .vq-range {
  background: linear-gradient(
    to right,
    var(--vq-ink) 0 calc((v-bind(minutes) - 5) / 115 * 100%),
    var(--vq-surface-2) 0
  );
}
.vq-range::-webkit-slider-thumb {
  appearance: none;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: var(--vq-yellow);
  border: 3px solid #16141c;
  cursor: grab;
}
.vq-range::-moz-range-thumb {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: var(--vq-yellow);
  border: 3px solid #16141c;
}
</style>
