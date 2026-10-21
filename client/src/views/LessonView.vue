<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { motion, AnimatePresence } from 'motion-v'
import confetti from 'canvas-confetti'
import { PhCheckCircle, PhStar, PhXCircle, PhX } from '@phosphor-icons/vue'
import type { PathCompleteResponse, PathLessonDTO, StudyCardDTO } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import ChoiceQuestion from '@/components/questions/ChoiceQuestion.vue'
import MatchingQuestion from '@/components/questions/MatchingQuestion.vue'
import { api, ApiRequestError } from '@/api/client'
import { useSound } from '@/composables/useSound'
import { useStatsStore } from '@/stores/stats'
import { spring } from '@/lib/motion'

/**
 * Lección del camino, estilo Duolingo: una pregunta por pantalla → "Comprobar" → franja verde o roja.
 * Las que falla vuelven al final; termina cuando todas están bien. Estrellas según aciertos a la primera.
 */
const route = useRoute()
const router = useRouter()
const stats = useStatsStore()
const { play } = useSound()
const key = String(route.params.key)

interface Item {
  card: StudyCardDTO
  /** orden mostrado de las opciones (MC) o de la columna derecha (emparejar) */
  perm: number[]
  /** ya la falló antes en esta lección */
  retry: boolean
}
const lesson = ref<PathLessonDTO | null>(null)
const queue = ref<Item[]>([])
const answer = ref<number | number[] | null>(null)
const checked = ref<null | boolean>(null)
const correctCount = ref(0)
const firstTry = ref(0)
const failed = new Set<string>()
const result = ref<PathCompleteResponse | null>(null)
/** Primero aprende (los datos clave de la lección), luego practica */
const phase = ref<'learn' | 'practice'>('learn')
const learnIndex = ref(0)
const learnCards = computed(() => {
  const seen = new Set<string>()
  return [...(lesson.value?.cards ?? [])]
    .sort((a, b) => a.topic.localeCompare(b.topic))
    .filter((c) => {
      const k = c.sourceQuote.trim().toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
})
const learnCard = computed(() => learnCards.value[learnIndex.value] ?? null)
function nextLearn() {
  if (learnIndex.value < learnCards.value.length - 1) {
    learnIndex.value++
    play('tap')
  } else startPractice()
}
function startPractice() {
  phase.value = 'practice'
  play('pop')
}
const error = ref('')
const saving = ref(false)

const shuffled = (n: number) => {
  const a = [...Array(n).keys()]
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}
const toItem = (card: StudyCardDTO, retry = false): Item => ({
  card,
  retry,
  perm: shuffled(card.data.type === 'multiple_choice' ? card.data.options.length : card.data.type === 'matching' ? card.data.pairs.length : 0),
})

onMounted(async () => {
  try {
    lesson.value = await api.pathLesson(key)
    queue.value = shuffled(lesson.value.cards.length).map((i) => toItem(lesson.value!.cards[i]!))
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude cargar la lección.'
  }
})

const total = computed(() => lesson.value?.cards.length ?? 0)
const item = computed(() => queue.value[0] ?? null)
const options = computed(() => {
  const d = item.value?.card.data
  if (d?.type === 'multiple_choice') return item.value!.perm.map((i) => d.options[i]!)
  if (d?.type === 'true_false') return d.options
  return []
})
const right = computed(() => {
  const d = item.value?.card.data
  return d?.type === 'matching' ? item.value!.perm.map((i) => d.pairs[i]!.right) : []
})
const ready = computed(() => {
  const d = item.value?.card.data
  if (!d || answer.value === null) return false
  if (d.type === 'matching') return Array.isArray(answer.value) && answer.value.every((m) => m >= 0)
  return true
})

function isCorrect(): boolean {
  const { card, perm } = item.value!
  const d = card.data
  const a = answer.value
  if (d.type === 'multiple_choice') return typeof a === 'number' && perm[a] === d.correctIndex
  if (d.type === 'true_false') return a === d.correctIndex
  if (d.type === 'matching') return Array.isArray(a) && a.every((r, l) => perm[r] === l)
  return false
}

const correctText = computed(() => {
  const d = item.value?.card.data
  if (!d) return ''
  if (d.type === 'multiple_choice' || d.type === 'true_false') return d.options[d.correctIndex]!
  if (d.type === 'matching') return d.pairs.map((p) => `${p.left} → ${p.right}`).join(' · ')
  return d.expectedAnswer
})

function check() {
  if (!ready.value || checked.value !== null) return
  const ok = isCorrect()
  checked.value = ok
  play(ok ? 'correct' : 'wrong')
  const id = item.value!.card.id
  if (ok) {
    correctCount.value++
    if (!failed.has(id)) firstTry.value++
  } else failed.add(id)
}

async function next() {
  const [cur, ...rest] = queue.value
  // la que falló vuelve al final, con las opciones en otro orden
  queue.value = checked.value ? rest : [...rest, toItem(cur!.card, true)]
  answer.value = null
  checked.value = null
  if (!queue.value.length) await finish()
}

async function finish() {
  saving.value = true
  try {
    result.value = await api.completeLesson(key, { firstTry: firstTry.value, total: total.value })
    play(result.value.stars === 3 ? 'perfect' : 'finish')
    if (result.value.stars === 3) confetti({ particleCount: 110, spread: 80, origin: { y: 0.5 }, colors: ['#f2b31f', '#8d6ce6', '#ee5fa8', '#35b673'] })
    stats.refresh().catch(() => {})
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude guardar la lección. Revisa tu internet.'
  } finally {
    saving.value = false
  }
}

function exit() {
  if (!result.value && correctCount.value > 0 && !confirm('¿Salir de la lección? Perderás el avance de esta lección.')) return
  router.push('/camino')
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-[560px] flex-col px-4 pt-5">
    <header v-if="!result" class="flex items-center gap-3">
      <button class="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Salir" @click="exit">
        <PhX :size="20" weight="bold" />
      </button>
      <div class="h-4 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" :aria-valuenow="correctCount" :aria-valuemax="total">
        <div
          :class="['h-full rounded-full transition-[width] duration-500', phase === 'learn' ? 'bg-sky' : 'bg-mint']"
          :style="{
            width: phase === 'learn' ? `${learnCards.length ? ((learnIndex + 1) / learnCards.length) * 100 : 0}%` : `${total ? (correctCount / total) * 100 : 0}%`,
          }"
        />
      </div>
      <button v-if="phase === 'learn' && lesson" class="shrink-0 text-[13px] font-bold text-ink-2" @click="startPractice">Ya lo sé</button>
    </header>

    <p v-if="error" class="mt-6 rounded-[18px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">
      {{ error }}
      <button class="mt-2 block font-bold underline" @click="router.push('/camino')">Volver al camino</button>
    </p>

    <!-- Resultado -->
    <section v-else-if="result" class="flex flex-1 flex-col items-center justify-center pb-10 text-center">
      <MascotBlob :mood="result.stars === 3 ? 'amazed' : 'celebrating'" :size="150" />
      <h1 class="mt-4 text-title font-extrabold">{{ result.stars === 3 ? '¡Perfecta!' : '¡Lección completa!' }}</h1>
      <div class="mt-4 flex gap-2">
        <motion.span
          v-for="s in 3"
          :key="s"
          :initial="{ scale: 0, rotate: -40 }"
          :animate="{ scale: 1, rotate: 0 }"
          :transition="{ ...spring.card, delay: 0.25 + s * 0.18 }"
        >
          <PhStar :size="52" weight="fill" :class="s <= result.stars ? 'text-yellow' : 'text-ink-3/25'" />
        </motion.span>
      </div>
      <p class="mt-3 text-[15px] font-medium text-ink-2">{{ firstTry }} de {{ total }} a la primera</p>
      <div class="mt-6 flex gap-2">
        <span class="rounded-[18px] bg-yellow px-4 py-3 text-on-color"><b class="font-display text-[22px]">+{{ result.xp }}</b> XP</span>
        <span v-if="result.bones" class="rounded-[18px] bg-lilac px-4 py-3 text-on-color"><b class="font-display text-[22px]">+{{ result.bones }}</b> huesitos</span>
        <span v-if="result.streak.extendedToday" class="rounded-[18px] bg-orange px-4 py-3 text-on-color"><b class="font-display text-[22px]">{{ result.streak.current }}</b> días</span>
      </div>
      <BaseButton class="mt-10" size="xl" block @click="router.push('/camino')">Continuar</BaseButton>
    </section>

    <!-- Aprende -->
    <template v-else-if="phase === 'learn' && learnCard && lesson">
      <AnimatePresence mode="wait">
        <motion.section
          :key="learnCard.id"
          class="flex-1 pb-36 pt-6"
          :initial="{ opacity: 0, x: 40 }"
          :animate="{ opacity: 1, x: 0 }"
          :exit="{ opacity: 0, x: -40 }"
          :transition="spring.card"
        >
          <div class="flex items-center gap-3">
            <MascotBlob mood="happy" :size="64" />
            <p class="rounded-[18px] rounded-bl-none bg-surface px-4 py-2.5 text-[14px] font-bold ring-1 ring-line">
              {{ learnIndex === 0 ? 'Primero aprende esto. Luego te pregunto.' : `Dato ${learnIndex + 1} de ${learnCards.length}` }}
            </p>
          </div>
          <p class="mt-6 text-[13px] font-bold uppercase tracking-wide text-ink-3">{{ learnCard.topic }}</p>
          <blockquote class="mt-2 rounded-card bg-sky-tint p-5">
            <p class="font-display text-[20px] font-bold leading-snug">“{{ learnCard.sourceQuote }}”</p>
            <p v-if="learnCard.sourceLocation" class="mt-2 text-[12.5px] font-bold text-ink-2">{{ learnCard.sourceLocation }}</p>
          </blockquote>
          <p class="mt-5 text-[15.5px] leading-relaxed"><span class="font-bold">En pocas palabras: </span>{{ learnCard.explanation }}</p>
        </motion.section>
      </AnimatePresence>
      <div class="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-bg px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <div class="mx-auto flex max-w-[560px] gap-2">
          <BaseButton v-if="learnIndex > 0" size="xl" variant="surface" @click="learnIndex--">Atrás</BaseButton>
          <BaseButton class="flex-1" size="xl" block @click="nextLearn">
            {{ learnIndex < learnCards.length - 1 ? 'Siguiente' : '¡A practicar!' }}
          </BaseButton>
        </div>
      </div>
    </template>

    <!-- Pregunta -->
    <template v-else-if="item && lesson">
      <AnimatePresence mode="wait">
        <motion.section
          :key="item.card.id + queue.length"
          class="flex-1 pb-56 pt-6"
          :initial="{ opacity: 0, x: 40 }"
          :animate="{ opacity: 1, x: 0 }"
          :exit="{ opacity: 0, x: -40 }"
          :transition="spring.card"
        >
          <p class="text-[13px] font-bold text-ink-3">{{ item.retry ? 'Otra vez esta' : lesson.label }} · {{ item.card.topic }}</p>
          <h2 class="mt-2 font-display text-[22px] font-bold leading-snug tracking-[-0.01em]">{{ item.card.prompt }}</h2>
          <div :class="['mt-5', checked !== null && 'pointer-events-none']">
            <MatchingQuestion
              v-if="item.card.data.type === 'matching'"
              :left="item.card.data.pairs.map((p) => p.left)"
              :right="right"
              :model-value="Array.isArray(answer) ? answer : null"
              @update:model-value="(v) => (answer = v)"
            />
            <ChoiceQuestion
              v-else
              :options="options"
              :true-false="item.card.data.type === 'true_false'"
              :model-value="typeof answer === 'number' ? answer : null"
              @update:model-value="(v) => { answer = v; play('select') }"
            />
          </div>
        </motion.section>
      </AnimatePresence>

      <!-- Franja inferior: Comprobar / resultado -->
      <div
        :class="[
          'fixed inset-x-0 bottom-0 z-30 border-t-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 transition-colors',
          checked === null ? 'border-line bg-bg' : checked ? 'border-transparent bg-mint-tint' : 'border-transparent bg-pink-tint',
        ]"
      >
        <div class="mx-auto max-w-[560px]">
          <motion.div v-if="checked !== null" :initial="{ opacity: 0, y: 16 }" :animate="{ opacity: 1, y: 0 }" class="mb-4">
            <p :class="['flex items-center gap-2 font-display text-[21px] font-extrabold', checked ? 'text-success' : 'text-danger']">
              <component :is="checked ? PhCheckCircle : PhXCircle" :size="26" weight="fill" />
              {{ checked ? ['¡Excelente!', '¡Bien!', '¡Eso es!', '¡Correcto!'][correctCount % 4] : 'Respuesta correcta:' }}
            </p>
            <p v-if="!checked" class="mt-1 text-[15px] font-bold leading-snug">{{ correctText }}</p>
            <p class="mt-1.5 max-h-28 overflow-y-auto text-[13.5px] leading-snug text-ink-2">
              {{ item.card.explanation }}
              <span v-if="item.card.sourceLocation" class="font-bold"> · {{ item.card.sourceLocation }}</span>
            </p>
          </motion.div>
          <BaseButton v-if="checked === null" size="xl" block :disabled="!ready" @click="check">Comprobar</BaseButton>
          <BaseButton v-else size="xl" block :variant="checked ? 'primary' : 'night'" :loading="saving" @click="next">Continuar</BaseButton>
        </div>
      </div>
    </template>

    <div v-else class="flex flex-1 items-center justify-center"><MascotBlob mood="thinking" :size="100" /></div>
  </main>
</template>
