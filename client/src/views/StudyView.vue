<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { motion, AnimatePresence } from 'motion-v'
import { PhArrowCounterClockwise, PhCheck, PhQuotes, PhX } from '@phosphor-icons/vue'
import type { SourceDTO, StudyCardDTO, StudyDeckDTO } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import { api, ApiRequestError } from '@/api/client'
import { useSourcesStore } from '@/stores/sources'
import { useSound } from '@/composables/useSound'
import { colorClasses, pressable, spring } from '@/lib/motion'

/**
 * Modo estudio: tarjetas con las preguntas del banco. Sin reloj, sin nota.
 * Ve la pregunta → toca para ver la respuesta → "Ya me la sé" o "Repasar" (vuelve a salir más adelante).
 */
const route = useRoute()
const router = useRouter()
const sources = useSourcesStore()
const { play } = useSound()

const ready = computed(() => sources.list.filter((s) => s.status === 'ready'))
const fromQuery = typeof route.query.sources === 'string' ? route.query.sources.split(',').filter(Boolean) : []
const pickIds = ref<string[]>(fromQuery)
const toggle = (id: string) =>
  (pickIds.value = pickIds.value.includes(id) ? pickIds.value.filter((x) => x !== id) : [...pickIds.value, id])

const deck = ref<StudyDeckDTO | null>(null)
const queue = ref<StudyCardDTO[]>([])
const known = ref(0)
const repeats = ref(0)
const revealed = ref(false)
const loading = ref(false)
const error = ref('')
const total = computed(() => deck.value?.cards.length ?? 0)
const card = computed(() => queue.value[0] ?? null)
const done = computed(() => !!deck.value && !queue.value.length)

async function start(ids = pickIds.value) {
  if (!ids.length) return
  loading.value = true
  error.value = ''
  try {
    deck.value = await api.studyDeck(ids)
    queue.value = [...deck.value.cards]
    known.value = 0
    repeats.value = 0
    revealed.value = false
    router.replace({ query: { sources: ids.join(',') } })
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude cargar las tarjetas. Intenta de nuevo.'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!sources.loaded) await sources.fetchAll().catch(() => {})
  if (fromQuery.length) return start(fromQuery)
  if (ready.value.length === 1) pickIds.value = [ready.value[0]!.id]
})

function reveal() {
  if (revealed.value) return
  revealed.value = true
  play('pop')
}
function gotIt() {
  play('correct')
  known.value++
  queue.value = queue.value.slice(1)
  revealed.value = false
}
function again() {
  play('tap')
  repeats.value++
  const [c, ...rest] = queue.value
  // vuelve a salir 4 tarjetas después (o al final si quedan pocas)
  rest.splice(Math.min(4, rest.length), 0, c!)
  queue.value = rest
  revealed.value = false
}
function restart() {
  if (!deck.value) return
  queue.value = [...deck.value.cards].sort(() => Math.random() - 0.5)
  known.value = 0
  repeats.value = 0
  revealed.value = false
}

const TF = ['Verdadero', 'Falso']
const levelDot = ['', 'bg-mint', 'bg-yellow', 'bg-orange', 'bg-pink']
const levelName = ['', 'Básica', 'Media', 'Difícil', 'Caso']
const multi = computed(() => new Set(deck.value?.cards.map((c) => c.sourceId)).size > 1)
const sourceOf = (id: string): SourceDTO | undefined => sources.byId.get(id)
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-[560px] flex-col px-4 pb-6 pt-5">
    <header class="flex items-center gap-3">
      <button class="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Salir" @click="router.push('/')">
        <PhX :size="20" weight="bold" />
      </button>
      <template v-if="deck && !done">
        <div class="h-3 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" :aria-valuenow="known" :aria-valuemax="total">
          <div class="h-full rounded-full bg-mint transition-[width] duration-300" :style="{ width: `${(known / total) * 100}%` }" />
        </div>
        <span class="shrink-0 text-[13px] font-bold tabular-nums text-ink-2">{{ known }}/{{ total }}</span>
      </template>
    </header>

    <!-- Elegir fuentes -->
    <template v-if="!deck">
      <h1 class="mt-6 text-mega font-extrabold">Estudiar</h1>
      <p class="mt-2 text-[15px] font-medium text-ink-2">Tarjetas con las preguntas de tus fuentes. Sin reloj y sin nota.</p>
      <button
        v-if="ready.length > 1"
        class="mt-5 self-start rounded-full bg-surface px-4 py-2 text-[13.5px] font-bold ring-1 ring-line"
        @click="pickIds = pickIds.length === ready.length ? [] : ready.map((s) => s.id)"
      >
        {{ pickIds.length === ready.length ? 'Quitar todas' : 'Elegir todas' }}
      </button>
      <div class="mt-3 flex flex-col gap-2">
        <motion.button
          v-for="s in ready"
          :key="s.id"
          type="button"
          role="checkbox"
          :aria-checked="pickIds.includes(s.id)"
          v-bind="pressable"
          :class="['flex items-center gap-3 rounded-[20px] p-3 text-left', pickIds.includes(s.id) ? colorClasses[s.color].solid : 'bg-surface ring-1 ring-line']"
          @click="toggle(s.id)"
        >
          <span :class="['grid size-8 shrink-0 place-items-center rounded-full', pickIds.includes(s.id) ? 'bg-night text-white' : 'bg-surface-2']">
            <PhCheck v-if="pickIds.includes(s.id)" :size="15" weight="bold" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-display text-[16px] font-bold">{{ s.title }}</span>
            <span class="text-[12.5px] font-semibold opacity-70">{{ s.bank.total }} tarjetas</span>
          </span>
        </motion.button>
        <p v-if="sources.loaded && !ready.length" class="rounded-[20px] bg-surface p-4 text-[14px] font-medium text-ink-2 ring-1 ring-line">
          No tienes fuentes listas todavía. Sube una con el botón + de abajo.
        </p>
      </div>
      <p v-if="error" class="mt-4 rounded-[18px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>
      <div class="flex-1" />
      <BaseButton class="mt-6" size="xl" block :disabled="!pickIds.length" :loading="loading" @click="start()">
        Empezar a estudiar
      </BaseButton>
    </template>

    <!-- Terminó -->
    <section v-else-if="done" class="flex flex-1 flex-col items-center justify-center text-center">
      <MascotBlob mood="celebrating" :size="150" />
      <h1 class="mt-4 text-title font-extrabold">¡Repasaste todo!</h1>
      <p class="mt-2 text-[15px] font-medium text-ink-2">
        {{ total }} tarjetas{{ repeats ? ` · repetiste ${repeats}` : ' y te las sabías todas a la primera' }}.
      </p>
      <div class="mt-8 flex w-full flex-col gap-2">
        <BaseButton size="lg" block @click="router.push({ path: '/configurar', query: { sources: route.query.sources } })">Ponerme a prueba con un examen</BaseButton>
        <BaseButton size="lg" variant="surface" block @click="restart"><PhArrowCounterClockwise :size="18" weight="bold" /> Repasar otra vez</BaseButton>
      </div>
    </section>

    <!-- Tarjeta -->
    <template v-else-if="card">
      <AnimatePresence mode="wait">
        <motion.article
          :key="card.id + known + repeats"
          class="mt-5 flex-1 cursor-pointer overflow-y-auto rounded-card bg-surface p-5 ring-1 ring-line"
          :initial="{ opacity: 0, x: 40 }"
          :animate="{ opacity: 1, x: 0 }"
          :exit="{ opacity: 0, x: -40 }"
          :transition="spring.card"
          @click="reveal"
        >
          <p class="flex items-start gap-2 text-[12.5px] font-semibold text-ink-3">
            <span :class="['mt-1.5 size-2 shrink-0 rounded-full', levelDot[card.difficulty]]" />
            <span class="min-w-0">
              {{ levelName[card.difficulty] }} · {{ card.topic }}
              <span v-if="multi && sourceOf(card.sourceId)" class="block truncate">{{ sourceOf(card.sourceId)!.title }}</span>
            </span>
          </p>
          <h2 class="mt-2 font-display text-[21px] font-bold leading-snug tracking-[-0.01em]">{{ card.prompt }}</h2>

          <!-- Opciones (MC): se ven antes, la correcta se pinta al revelar -->
          <ul v-if="card.data.type === 'multiple_choice'" class="mt-4 flex flex-col gap-1.5">
            <li
              v-for="(opt, i) in card.data.options"
              :key="opt"
              :class="[
                'flex items-start gap-2.5 rounded-[16px] px-3 py-2.5 text-[15px] font-semibold leading-snug transition-colors',
                revealed && i === card.data.correctIndex ? 'bg-mint-tint' : revealed ? 'text-ink-3' : 'bg-surface-2',
              ]"
            >
              <span :class="['grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-extrabold', revealed && i === card.data.correctIndex ? 'bg-success text-white' : 'bg-surface']">
                <PhCheck v-if="revealed && i === card.data.correctIndex" :size="13" weight="bold" />
                <template v-else>{{ 'ABCDE'[i] }}</template>
              </span>
              <span class="flex-1">{{ opt }}</span>
            </li>
          </ul>
          <p v-else-if="card.data.type === 'true_false' && !revealed" class="mt-4 text-[14px] font-bold text-ink-3">¿Verdadero o falso?</p>
          <ul v-else-if="card.data.type === 'matching'" class="mt-4 flex flex-col gap-1.5">
            <li v-for="p in card.data.pairs" :key="p.left" :class="['rounded-[16px] px-3 py-2.5 text-[14.5px] leading-snug', revealed ? 'bg-mint-tint' : 'bg-surface-2']">
              <span class="font-bold">{{ p.left }}</span>
              <span v-if="revealed" class="font-semibold"> → {{ p.right }}</span>
            </li>
          </ul>

          <p v-if="!revealed" class="mt-6 text-center text-[13px] font-bold text-ink-3">Piénsala y toca para ver la respuesta</p>

          <!-- Respuesta -->
          <div v-else class="mt-4">
            <p
              v-if="card.data.type === 'true_false'"
              :class="['inline-flex rounded-full px-4 py-2 font-display text-[18px] font-bold text-on-color', card.data.correctIndex === 0 ? 'bg-mint' : 'bg-pink']"
            >
              {{ TF[card.data.correctIndex] }}
            </p>
            <div v-else-if="card.data.type === 'short_answer'" class="rounded-[16px] bg-mint-tint px-4 py-3">
              <p class="text-[15px] font-semibold leading-snug">{{ card.data.expectedAnswer }}</p>
              <ul v-if="card.data.keyPoints.length" class="mt-2 list-disc pl-5 text-[13.5px] font-medium text-ink-2">
                <li v-for="k in card.data.keyPoints" :key="k">{{ k }}</li>
              </ul>
            </div>
            <p class="mt-4 text-[14.5px] leading-relaxed"><span class="font-bold">Por qué: </span>{{ card.explanation }}</p>
            <blockquote class="mt-4 flex gap-3 rounded-[18px] bg-lilac-tint p-4">
              <PhQuotes :size="20" weight="fill" class="shrink-0 text-lilac" />
              <div>
                <p class="text-[14px] italic leading-snug">“{{ card.sourceQuote }}”</p>
                <p v-if="card.sourceLocation" class="mt-1.5 text-[12.5px] font-bold text-ink-2">{{ card.sourceLocation }}</p>
              </div>
            </blockquote>
          </div>
        </motion.article>
      </AnimatePresence>

      <div class="mt-4 grid grid-cols-2 gap-2">
        <template v-if="revealed">
          <BaseButton size="xl" variant="surface" @click="again"><PhArrowCounterClockwise :size="18" weight="bold" /> Repasar</BaseButton>
          <BaseButton size="xl" variant="primary" @click="gotIt"><PhCheck :size="18" weight="bold" /> Ya me la sé</BaseButton>
        </template>
        <BaseButton v-else class="col-span-2" size="xl" @click="reveal">Ver respuesta</BaseButton>
      </div>
    </template>
  </main>
</template>
