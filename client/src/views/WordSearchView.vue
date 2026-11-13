<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { motion, AnimatePresence } from 'motion-v'
import confetti from 'canvas-confetti'
import { PhArrowLeft, PhArrowsClockwise, PhCheckCircle, PhLightbulb } from '@phosphor-icons/vue'
import type { GameCompleteResponse, WordSearchDTO, WordSearchWordDTO } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import MoccaPack from '@/components/games/MoccaPack.vue'
import { api, ApiRequestError } from '@/api/client'
import { colorClasses } from '@/lib/motion'
import { useSound } from '@/composables/useSound'
import { useStatsStore } from '@/stores/stats'

/**
 * Sopa de letras: cada pista es la definición de un término de la guía; ella busca la palabra y la marca
 * arrastrando el dedo (o tocando la primera y la última letra). Al encontrarlas todas gana un sobre de Moccas.
 */
const route = useRoute()
const router = useRouter()
const { play } = useSound()
const stats = useStatsStore()
const sourceId = String(route.params.sourceId)

const game = ref<WordSearchDTO | null>(null)
const error = ref('')
const found = ref(new Set<string>())
const result = ref<GameCompleteResponse | null>(null)
const finishing = ref(false)
/** la pista que mira ahora (la primera sin encontrar, o la que tocó) */
const focus = ref<string | null>(null)
/** pista: se ilumina la primera letra un momento */
const hintCell = ref<string | null>(null)
/** se equivocó: la selección tiembla en rojo */
const miss = ref(false)

const COLORS = ['#ab90f7', '#59d394', '#ff9b45', '#7fb4ff', '#ff86c3', '#ffcf3f', '#4fd1c5']

async function load() {
  error.value = ''
  game.value = null
  found.value = new Set()
  result.value = null
  try {
    game.value = await api.newWordSearch(sourceId)
    focus.value = game.value.words[0]?.word ?? null
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude armar la sopa de letras.'
  }
}
onMounted(load)

const letters = computed(() => game.value?.rows.map((r) => [...r]) ?? [])
const key = (r: number, c: number) => `${r}:${c}`
const cellsOf = (w: Pick<WordSearchWordDTO, 'row' | 'col' | 'dr' | 'dc' | 'word'>) =>
  [...w.word].map((_, i) => key(w.row + w.dr * i, w.col + w.dc * i))

/** cada celda encontrada → color de su palabra */
const foundColor = computed(() => {
  const map = new Map<string, string>()
  game.value?.words.forEach((w, i) => {
    if (found.value.has(w.word)) for (const k of cellsOf(w)) map.set(k, COLORS[i % COLORS.length]!)
  })
  return map
})
const current = computed(() => game.value?.words.find((w) => w.word === focus.value) ?? null)
const pending = computed(() => game.value?.words.filter((w) => !found.value.has(w.word)) ?? [])

// ── Selección: arrastrar en línea recta (horizontal, vertical o diagonal) ──
const start = ref<[number, number] | null>(null)
const end = ref<[number, number] | null>(null)
const selecting = ref(false)

/** De la celda de inicio a la del dedo, ajustado a la dirección recta más cercana */
const selection = computed<string[]>(() => {
  if (!start.value || !end.value) return []
  const [r0, c0] = start.value
  let dr = end.value[0] - r0
  let dc = end.value[1] - c0
  const n = Math.max(Math.abs(dr), Math.abs(dc))
  if (n === 0) return [key(r0, c0)]
  // si no es recta, se lleva a la más cercana: horizontal, vertical o diagonal
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) {
    if (Math.abs(dr) > 2 * Math.abs(dc)) dc = 0
    else if (Math.abs(dc) > 2 * Math.abs(dr)) dr = 0
    else {
      const m = Math.max(Math.abs(dr), Math.abs(dc))
      dr = Math.sign(dr) * m
      dc = Math.sign(dc) * m
    }
  }
  const steps = Math.max(Math.abs(dr), Math.abs(dc))
  const sr = Math.sign(dr)
  const sc = Math.sign(dc)
  const size = game.value?.size ?? 0
  const out: string[] = []
  for (let i = 0; i <= steps; i++) {
    const r = r0 + sr * i
    const c = c0 + sc * i
    if (r < 0 || c < 0 || r >= size || c >= size) break
    out.push(key(r, c))
  }
  return out
})
const selected = computed(() => new Set(selection.value))

function cellFromPoint(x: number, y: number): [number, number] | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-cell]') as HTMLElement | null
  if (!el) return null
  const [r, c] = el.dataset.cell!.split(':').map(Number)
  return [r!, c!]
}
function down(e: PointerEvent) {
  const cell = cellFromPoint(e.clientX, e.clientY)
  if (!cell || result.value) return
  // tocar-tocar: si ya había una letra marcada y no está arrastrando, esta es la última
  if (start.value && !selecting.value && selection.value.length === 1) {
    end.value = cell
    return check()
  }
  start.value = cell
  end.value = cell
  selecting.value = true
  play('tap')
}
function move(e: PointerEvent) {
  if (!selecting.value) return
  const cell = cellFromPoint(e.clientX, e.clientY)
  if (cell) end.value = cell
}
function up() {
  if (!selecting.value) return
  selecting.value = false
  // un solo toque: queda marcada esperando la última letra
  if (selection.value.length > 1) check()
}

function check() {
  const cells = selection.value
  const g = game.value
  if (!g) return
  const text = cells.map((k) => letters.value[Number(k.split(':')[0])]![Number(k.split(':')[1])]).join('')
  const reversed = [...text].reverse().join('')
  const hit = g.words.find((w) => !found.value.has(w.word) && (w.word === text || w.word === reversed) && sameCells(cellsOf(w), cells))
  if (hit) {
    found.value = new Set([...found.value, hit.word])
    play('correct')
    if (navigator.vibrate) navigator.vibrate(20)
    const next = g.words.find((w) => !found.value.has(w.word))
    focus.value = next?.word ?? null
    if (!next) void finish()
  } else if (cells.length > 1) {
    miss.value = true
    play('wrong')
    setTimeout(() => (miss.value = false), 380)
  }
  start.value = null
  end.value = null
}
const sameCells = (a: string[], b: string[]) => a.length === b.length && (a.every((k, i) => k === b[i]) || a.every((k, i) => k === b[b.length - 1 - i]))

function hint() {
  const w = current.value
  if (!w) return
  hintCell.value = key(w.row, w.col)
  play('pop')
  setTimeout(() => (hintCell.value = null), 1600)
}

async function finish() {
  const g = game.value
  if (!g) return
  finishing.value = true
  try {
    result.value = await api.completeGame(g.id)
    play('finish')
    confetti({ particleCount: 90, spread: 100, origin: { y: 0.45 }, colors: ['#ab90f7', '#ffcf3f', '#ff86c3', '#59d394'] })
    stats.refresh().catch(() => {})
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude guardar la partida. Revisa tu internet.'
  } finally {
    finishing.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-[520px] flex-col px-3 pb-8 pt-4">
    <header class="flex items-center gap-3 px-1">
      <button class="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Volver" @click="router.push('/jugar')">
        <PhArrowLeft :size="20" weight="bold" />
      </button>
      <div class="min-w-0 flex-1">
        <p class="text-[12px] font-bold uppercase tracking-wide text-ink-3">Sopa de letras</p>
        <p class="truncate font-display text-[17px] font-extrabold leading-tight">{{ game?.title ?? '…' }}</p>
      </div>
      <span v-if="game" class="shrink-0 rounded-full bg-surface px-3 py-1.5 text-[13px] font-extrabold ring-1 ring-line">{{ found.size }}/{{ game.words.length }}</span>
    </header>

    <p v-if="error" class="mx-1 mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">
      {{ error }}
      <button class="mt-2 block font-bold underline" @click="load">Intentar otra vez</button>
    </p>

    <template v-if="game">
      <!-- la pista de ahora -->
      <section v-if="current && !result" :class="['mx-1 mt-4 flex items-start gap-3 rounded-[22px] p-4', colorClasses[game.color].tint]">
        <MascotBlob mood="curious" :size="54" class="-mt-1 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-[11.5px] font-extrabold uppercase tracking-wide text-ink-2">{{ current.topic }} · {{ current.word.length }} letras</p>
          <p class="mt-0.5 text-[15.5px] font-bold leading-snug">{{ current.clue }}</p>
        </div>
        <button class="grid size-10 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Pista: dónde empieza" @click="hint">
          <PhLightbulb :size="19" weight="fill" class="text-yellow" />
        </button>
      </section>

      <!-- la cuadrícula -->
      <div
        :class="['grid-board mt-3 select-none rounded-[22px] bg-surface p-1.5 ring-1 ring-line', miss && 'grid-board--miss']"
        :style="{ gridTemplateColumns: `repeat(${game.size}, minmax(0, 1fr))` }"
        style="touch-action: none"
        @pointerdown.prevent="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
        @pointerleave="up"
      >
        <template v-for="(row, r) in letters" :key="r">
          <span
            v-for="(ch, c) in row"
            :key="`${r}:${c}`"
            :data-cell="`${r}:${c}`"
            :class="[
              'cell grid aspect-square place-items-center rounded-[8px] font-display font-extrabold',
              game.size > 11 ? 'text-[clamp(13px,3.6vw,19px)]' : 'text-[clamp(15px,4.4vw,22px)]',
              selected.has(`${r}:${c}`) && 'cell--sel',
              hintCell === `${r}:${c}` && 'cell--hint',
            ]"
            :style="foundColor.get(`${r}:${c}`) ? { background: foundColor.get(`${r}:${c}`), color: '#2a1810' } : undefined"
          >
            {{ ch }}
          </span>
        </template>
      </div>
      <p v-if="!result" class="mt-2 text-center text-[12.5px] font-medium text-ink-3">Arrastra el dedo sobre la palabra, o toca su primera y su última letra.</p>

      <!-- las pistas -->
      <ul class="mx-1 mt-4 flex flex-col gap-1.5">
        <li v-for="(w, i) in game.words" :key="w.word">
          <button
            :class="[
              'flex w-full items-start gap-2.5 rounded-[16px] px-3 py-2.5 text-left transition-colors',
              found.has(w.word) ? 'bg-surface-2' : w.word === focus ? 'bg-surface ring-2 ring-lilac' : 'bg-surface ring-1 ring-line',
            ]"
            :disabled="found.has(w.word)"
            @click="focus = w.word"
          >
            <span class="mt-1 size-3 shrink-0 rounded-full" :style="{ background: found.has(w.word) ? COLORS[i % COLORS.length] : 'var(--vq-line, #3a3545)' }" />
            <span class="min-w-0 flex-1">
              <span v-if="found.has(w.word)" class="flex items-center gap-1.5 font-display text-[15px] font-extrabold">
                {{ w.display }} <PhCheckCircle :size="17" weight="fill" class="text-success" />
              </span>
              <span :class="['block text-[13.5px] leading-snug', found.has(w.word) ? 'text-ink-3' : 'font-semibold']">{{ w.clue }}</span>
            </span>
          </button>
        </li>
      </ul>
    </template>

    <div v-else-if="!error" class="mt-24 flex flex-col items-center">
      <MascotBlob mood="thinking" :size="100" />
      <p class="mt-3 text-[14px] font-semibold text-ink-2">Armando tu sopa de letras…</p>
    </div>

    <!-- ¡terminó! -->
    <AnimatePresence>
      <motion.div
        v-if="result"
        class="fixed inset-0 z-50 flex items-end bg-black/55 sm:items-center sm:justify-center"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
      >
        <motion.div
          class="w-full rounded-t-[30px] bg-bg p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center sm:max-w-[400px] sm:rounded-[30px]"
          :initial="{ y: 260 }"
          :animate="{ y: 0 }"
          :transition="{ type: 'spring', stiffness: 300, damping: 26 }"
        >
          <div class="flex justify-center">
            <MoccaPack v-if="result.pack" :size="92" shine />
            <MascotBlob v-else mood="celebrating" :size="120" />
          </div>
          <h2 class="mt-3 font-display text-[26px] font-extrabold">{{ result.pack ? '¡Ganaste un sobre!' : '¡Sopa completa!' }}</h2>
          <p class="mt-1 text-[14.5px] text-ink-2">
            {{
              result.pack
                ? `Encontraste las ${game?.words.length} palabras. +${result.xp} XP.`
                : `+${result.xp} XP. Ya ganaste los ${result.dailyLimit} sobres de hoy: mañana hay más.`
            }}
          </p>
          <div class="mt-6 flex flex-col gap-2">
            <BaseButton v-if="result.packs > 0" size="xl" variant="primary" block @click="router.push('/album?abrir=1')">
              Abrir {{ result.packs === 1 ? 'el sobre' : `sobres (${result.packs})` }}
            </BaseButton>
            <BaseButton size="lg" :variant="result.packs > 0 ? 'surface' : 'primary'" block :loading="finishing" @click="load">
              <PhArrowsClockwise :size="18" weight="bold" /> Otra sopa de este tema
            </BaseButton>
            <button class="mt-1 text-[14px] font-bold text-ink-2" @click="router.push('/jugar')">Elegir otro tema</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  </main>
</template>

<style scoped>
.grid-board {
  display: grid;
  gap: 3px;
}
.cell {
  background: var(--vq-surface-2, #2a2633);
  transition:
    background 0.15s,
    transform 0.15s;
}
.cell--sel {
  background: var(--vq-lilac) !important;
  color: #fff !important;
  transform: scale(1.08);
}
.cell--hint {
  animation: hint 0.400s ease-in-out 4;
}
.grid-board--miss .cell--sel {
  background: var(--vq-pink) !important;
  animation: shake 0.300s ease-in-out;
}
@keyframes hint {
  50% {
    background: var(--vq-yellow);
    color: #2a1810;
    transform: scale(1.18);
  }
}
@keyframes shake {
  25% {
    translate: -3px 0;
  }
  75% {
    translate: 3px 0;
  }
}
</style>
