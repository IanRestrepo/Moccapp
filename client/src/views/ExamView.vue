<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AnimatePresence, motion } from 'motion-v'
import { PhCheckCircle, PhCloudCheck, PhSquaresFour, PhTimer, PhX } from '@phosphor-icons/vue'
import { QUESTION_TYPE_LABELS, type Answer, type ExamInProgressDTO, type PublicQuestion } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import ChoiceQuestion from '@/components/questions/ChoiceQuestion.vue'
import MatchingQuestion from '@/components/questions/MatchingQuestion.vue'
import ShortAnswerQuestion from '@/components/questions/ShortAnswerQuestion.vue'
import { api, ApiRequestError } from '@/api/client'
import { clock } from '@/lib/format'
import { spring } from '@/lib/motion'
import { useExamStore } from '@/stores/exam'
import { useStatsStore } from '@/stores/stats'
import { useSound } from '@/composables/useSound'

const route = useRoute()
const router = useRouter()
const examStore = useExamStore()
const statsStore = useStatsStore()
const sound = useSound()
const id = route.params.id as string

const exam = ref<ExamInProgressDTO | null>(null)
const loadError = ref<string | null>(null)
const answers = reactive<Record<string, Answer | null>>({})
const index = ref(0)
const dir = ref(1)

// ── Carga ────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const cached = examStore.active?.id === id ? examStore.active : null
    const dto = cached ?? (await api.getExam(id))
    if (dto.status !== 'in_progress') {
      if (dto.status === 'completed') examStore.setResult(dto)
      return void router.replace(`/resultados/${id}`)
    }
    exam.value = dto
    Object.assign(answers, dto.savedAnswers)
    // retoma en la primera sin responder
    const firstOpen = dto.questions.findIndex((q) => !dto.savedAnswers[q.id])
    index.value = firstOpen === -1 ? 0 : firstOpen
    startClock(dto)
  } catch (err) {
    loadError.value = err instanceof ApiRequestError ? err.message : 'No pude abrir el examen.'
  }
})

const q = computed<PublicQuestion | undefined>(() => exam.value?.questions[index.value])
const total = computed(() => exam.value?.questions.length ?? 0)
const isAnswered = (a: Answer | null | undefined) =>
  !!a && (a.type === 'short_answer' ? a.text.trim().length > 0 : a.type === 'matching' ? a.matches.some((m) => m >= 0) : true)
const answeredCount = computed(() => exam.value?.questions.filter((x) => isAnswered(answers[x.id])).length ?? 0)

// ── Cronómetro (fuente de verdad: deadline del servidor) ─────
const remaining = ref(0)
const limitSec = ref(1)
let offset = 0
let ticker: number | undefined
let warned = false

function startClock(dto: ExamInProgressDTO) {
  offset = new Date(dto.serverNow).getTime() - Date.now() // desfase del reloj del celular
  const deadline = new Date(dto.deadlineAt).getTime()
  limitSec.value = (deadline - new Date(dto.startedAt).getTime()) / 1000
  const tick = () => {
    remaining.value = Math.max(0, (deadline - (Date.now() + offset)) / 1000)
    if (!warned && remaining.value <= 60 && limitSec.value > 120) {
      warned = true
      sound.play('tick')
    }
    if (remaining.value <= 0) {
      clearInterval(ticker)
      submit(true)
    }
  }
  tick()
  ticker = window.setInterval(tick, 250)
}
onBeforeUnmount(() => clearInterval(ticker))

/** Poco tiempo: menos del 15 % o del último minuto. Cambia a naranja, sin rojo ni parpadeos. */
const low = computed(() => remaining.value > 0 && remaining.value <= Math.max(60, limitSec.value * 0.15))

// ── Respuestas y autosave ────────────────────────────────────
const saveState = ref<'idle' | 'saving' | 'saved' | 'offline'>('idle')

async function setAnswer(answer: Answer) {
  if (!q.value || !exam.value) return
  answers[q.value.id] = answer
  if (answer.type !== 'short_answer') sound.play('select')
  saveState.value = 'saving'
  try {
    await api.saveAnswer(exam.value.id, q.value.id, answer)
    saveState.value = 'saved'
  } catch {
    // sin conexión: se manda igual al enviar el examen
    saveState.value = 'offline'
  }
}

const choiceValue = computed(() => {
  const a = q.value ? answers[q.value.id] : null
  return a && (a.type === 'multiple_choice' || a.type === 'true_false') ? a.selectedIndex : null
})
const matchingValue = computed(() => {
  const a = q.value ? answers[q.value.id] : null
  return a?.type === 'matching' ? a.matches : null
})
const shortValue = computed(() => {
  const a = q.value ? answers[q.value.id] : null
  return a?.type === 'short_answer' ? a.text : null
})

// ── Navegación ───────────────────────────────────────────────
function go(delta: number) {
  dir.value = delta
  index.value = Math.min(total.value - 1, Math.max(0, index.value + delta))
}
function jump(i: number) {
  dir.value = i > index.value ? 1 : -1
  index.value = i
  overview.value = false
}
const overview = ref(false)
const isLast = computed(() => index.value === total.value - 1)

// ── Enviar ───────────────────────────────────────────────────
const confirmSubmit = ref(false)
const confirmExit = ref(false)
const submitting = ref(false)
const submitError = ref<string | null>(null)

async function submit(auto = false) {
  if (!exam.value || submitting.value) return
  confirmSubmit.value = false
  submitting.value = true
  submitError.value = null
  clearInterval(ticker)
  try {
    const result = await api.submitExam(exam.value.id, {
      auto,
      answers: exam.value.questions.map((x) => ({ questionId: x.id, answer: answers[x.id] ?? null })),
    })
    if (result.status === 'completed') examStore.setResult(result)
    statsStore.refresh().catch(() => {})
    router.replace(`/resultados/${exam.value.id}`)
  } catch (err) {
    // corrección pendiente: las respuestas ya quedaron guardadas; Resultados ofrece "corregir de nuevo"
    if (err instanceof ApiRequestError && err.code === 'GRADING_PENDING') return void router.replace(`/resultados/${exam.value.id}`)
    submitError.value = err instanceof ApiRequestError ? err.message : 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.'
    submitting.value = false
  }
}

function askSubmit() {
  if (answeredCount.value < total.value) confirmSubmit.value = true
  else submit(false)
}

watch(index, () => window.scrollTo({ top: 0 }))
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-[560px] flex-col px-4 pb-6 pt-5">
    <p v-if="loadError" class="mt-10 rounded-[20px] bg-pink-tint px-4 py-3 text-center text-[15px] font-semibold">{{ loadError }}</p>

    <template v-else-if="exam && q">
      <header class="flex items-center gap-3">
        <button class="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Salir del examen" @click="confirmExit = true">
          <PhX :size="20" weight="bold" />
        </button>
        <ProgressBar class="flex-1" :value="answeredCount" :max="total" label="Preguntas respondidas" />
        <span
          :class="[
            'flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 font-display text-[17px] font-bold tabular-nums transition-colors duration-700',
            low ? 'bg-orange text-on-color' : 'bg-night text-white',
          ]"
          role="timer"
          :aria-label="`Quedan ${clock(remaining)}`"
        >
          <PhTimer :size="18" weight="bold" />
          {{ clock(remaining) }}
        </span>
      </header>

      <div class="mt-5 flex items-center justify-between">
        <button class="flex items-center gap-2 text-[14px] font-semibold text-ink-2" @click="overview = true">
          <PhSquaresFour :size="18" weight="bold" />
          <span><span class="font-bold text-ink">{{ index + 1 }}</span> de {{ total }}</span>
          <span class="size-1 rounded-full bg-ink-3" />
          {{ QUESTION_TYPE_LABELS[q.type] }}
        </button>
        <span class="flex items-center gap-1 text-[12.5px] font-semibold text-ink-3" aria-live="polite">
          <template v-if="saveState === 'saved'"><PhCloudCheck :size="16" weight="bold" /> Guardado</template>
          <template v-else-if="saveState === 'saving'">Guardando…</template>
          <template v-else-if="saveState === 'offline'">Sin conexión: se envía al final</template>
        </span>
      </div>

      <p v-if="index === 0 && examStore.shortBy > 0" class="mt-3 rounded-[18px] bg-yellow-tint px-4 py-2.5 text-[13.5px] font-semibold">
        El banco alcanzó para {{ total }} preguntas. Mocca está preparando más para el próximo.
      </p>

      <AnimatePresence mode="wait">
        <motion.section
          :key="q.id"
          class="mt-4 flex flex-1 flex-col"
          :initial="{ opacity: 0, x: 48 * dir }"
          :animate="{ opacity: 1, x: 0 }"
          :exit="{ opacity: 0, x: -48 * dir }"
          :transition="spring.card"
        >
          <p class="text-[13px] font-semibold text-ink-3">{{ q.topic }}</p>
          <h1 class="mt-1.5 font-display text-[23px] font-bold leading-[1.2] tracking-[-0.02em]">{{ q.prompt }}</h1>

          <div class="mt-6">
            <ChoiceQuestion
              v-if="q.type === 'multiple_choice' || q.type === 'true_false'"
              :options="q.options"
              :true-false="q.type === 'true_false'"
              :model-value="choiceValue"
              @update:model-value="(i) => setAnswer({ type: q!.type as 'multiple_choice', selectedIndex: i })"
            />
            <MatchingQuestion
              v-else-if="q.type === 'matching'"
              :left="q.left"
              :right="q.right"
              :model-value="matchingValue"
              @update:model-value="(m) => setAnswer({ type: 'matching', matches: m })"
            />
            <ShortAnswerQuestion
              v-else
              :model-value="shortValue"
              @update:model-value="(t) => setAnswer({ type: 'short_answer', text: t })"
            />
          </div>
        </motion.section>
      </AnimatePresence>

      <p v-if="submitError" role="alert" class="mt-6 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ submitError }}</p>

      <footer class="sticky bottom-0 mt-8 flex gap-2.5 bg-gradient-to-t from-bg from-70% to-transparent pb-[max(8px,env(safe-area-inset-bottom))] pt-4">
        <BaseButton variant="surface" size="xl" :disabled="index === 0" @click="go(-1)">Atrás</BaseButton>
        <BaseButton v-if="!isLast" class="flex-1" size="xl" @click="go(1)">
          {{ isAnswered(answers[q.id]) ? 'Siguiente' : 'Saltar' }}
        </BaseButton>
        <BaseButton v-else class="flex-1" variant="primary" size="xl" :loading="submitting" @click="askSubmit">Enviar examen</BaseButton>
      </footer>
    </template>

    <!-- cargando -->
    <div v-else class="flex flex-1 flex-col items-center justify-center">
      <MascotBlob mood="thinking" :size="120" />
    </div>

    <!-- Vista general: saltar a cualquier pregunta -->
    <AnimatePresence>
      <div v-if="overview && exam" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <motion.div class="absolute inset-0 bg-[#16141c]/55" :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :exit="{ opacity: 0 }" @click="overview = false" />
        <motion.div
          class="relative w-full rounded-t-[34px] bg-bg p-6 pb-[max(24px,env(safe-area-inset-bottom))] sm:max-w-[440px] sm:rounded-[34px]"
          :initial="{ y: '100%' }"
          :animate="{ y: 0 }"
          :exit="{ y: '100%' }"
          :transition="spring.card"
        >
          <h2 class="text-[26px] font-extrabold">Tus respuestas</h2>
          <p class="mt-1 text-[14px] font-medium text-ink-2">{{ answeredCount }} de {{ total }} respondidas</p>
          <div class="mt-5 grid grid-cols-6 gap-2">
            <button
              v-for="(x, i) in exam.questions"
              :key="x.id"
              :class="[
                'grid aspect-square place-items-center rounded-[14px] font-display text-[16px] font-bold',
                isAnswered(answers[x.id]) ? 'bg-lilac text-on-color' : 'bg-surface ring-1 ring-line',
                i === index && 'ring-[3px] ring-night ring-inset',
              ]"
              :aria-label="`Pregunta ${i + 1}${isAnswered(answers[x.id]) ? ', respondida' : ''}`"
              @click="jump(i)"
            >
              {{ i + 1 }}
            </button>
          </div>
          <BaseButton class="mt-6" variant="primary" size="lg" block @click="(overview = false), askSubmit()">
            <PhCheckCircle :size="20" weight="bold" /> Enviar examen
          </BaseButton>
        </motion.div>
      </div>
    </AnimatePresence>

    <ConfirmDialog
      :open="confirmSubmit"
      :title="`Te faltan ${total - answeredCount}`"
      body="Las que dejes en blanco cuentan como 0. ¿Las revisas o envías así?"
      confirm="Enviar así"
      cancel="Seguir respondiendo"
      @confirm="submit(false)"
      @cancel="confirmSubmit = false"
    />
    <ConfirmDialog
      :open="confirmExit"
      title="¿Salir del examen?"
      body="Tus respuestas quedan guardadas, pero el cronómetro sigue corriendo. Puedes volver desde Inicio."
      confirm="Salir"
      cancel="Seguir en el examen"
      mood="sad"
      @confirm="router.push('/')"
      @cancel="confirmExit = false"
    />

    <!-- corrigiendo -->
    <AnimatePresence>
      <motion.div
        v-if="submitting"
        class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg/95 px-8 text-center backdrop-blur-sm"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        role="status"
      >
        <MascotBlob mood="thinking" :size="150" />
        <p class="mt-5 font-display text-[26px] font-extrabold">{{ remaining <= 0 ? '¡Se acabó el tiempo!' : 'Corrigiendo…' }}</p>
        <p class="mt-2 text-[15px] font-medium text-ink-2">Mocca está revisando tus respuestas abiertas.</p>
      </motion.div>
    </AnimatePresence>
  </main>
</template>
