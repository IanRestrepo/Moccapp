<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { motion } from 'motion-v'
import { PhArrowLeft, PhArrowsClockwise, PhBookOpenText, PhCards, PhCheckCircle, PhCircle, PhExam, PhGraph, PhListChecks } from '@phosphor-icons/vue'
import type { StudyGuideDTO } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import GuideSectionBody from '@/components/guide/GuideSectionBody.vue'
import ConceptMap from '@/components/guide/ConceptMap.vue'
import { api, ApiRequestError } from '@/api/client'
import { colorClasses, spring } from '@/lib/motion'
import { paragraphs, richText } from '@/lib/richText'
import { useSound } from '@/composables/useSound'

/**
 * Guía de estudio de una fuente: TODO el tema explicado por secciones (para estudiar de verdad, no solo repasar),
 * el mapa conceptual y la lista de "antes del parcial debes poder…". La primera vez se prepara (1–2 min).
 */
const route = useRoute()
const router = useRouter()
const { play } = useSound()
const id = String(route.params.id)
const data = ref<StudyGuideDTO | null>(null)
const error = ref('')
const retrying = ref(false)

type Tab = 'resumen' | 'mapa' | 'repaso'
const tab = ref<Tab>('resumen')

let timer = 0
async function load() {
  try {
    data.value = await api.guide(id)
    error.value = ''
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude abrir la guía. Revisa tu internet.'
  }
  clearTimeout(timer)
  // mientras se prepara, vuelve a preguntar
  if (data.value?.status === 'generating') timer = window.setTimeout(load, 4000)
  else if (data.value?.status === 'ready' && waited) play('pop')
}
let waited = false
onMounted(async () => {
  await load()
  waited = data.value?.status === 'generating'
})
onBeforeUnmount(() => clearTimeout(timer))

async function retry() {
  retrying.value = true
  try {
    data.value = await api.retryGuide(id)
    waited = true
    timer = window.setTimeout(load, 4000)
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No se pudo reintentar.'
  } finally {
    retrying.value = false
  }
}

const guide = computed(() => data.value?.guide ?? null)
const color = computed(() => colorClasses[data.value?.color ?? 'lilac'])
const minutes = computed(() => {
  const g = guide.value
  if (!g) return 0
  const words = [g.overview, ...g.sections.flatMap((s) => [s.summary, ...s.keyPoints, ...s.terms.map((t) => t.definition)])].join(' ').split(/\s+/).length
  return Math.max(1, Math.round(words / 180))
})

// ── secciones leídas y lista de repaso: quedan en este celular ──
const readKey = `vq-guide-read-${id}`
const checkKey = `vq-guide-check-${id}`
const loadSet = (k: string) => {
  try {
    return new Set<number>(JSON.parse(localStorage.getItem(k) ?? '[]'))
  } catch {
    return new Set<number>()
  }
}
const read = ref(loadSet(readKey))
const checked = ref(loadSet(checkKey))
function toggle(set: typeof read, key: string, i: number) {
  const s = new Set(set.value)
  if (s.has(i)) s.delete(i)
  else {
    s.add(i)
    play('correct')
  }
  set.value = s
  try {
    localStorage.setItem(key, JSON.stringify([...s]))
  } catch {
    /* sin almacenamiento */
  }
}

const toggleRead = (i: number) => toggle(read, readKey, i)
const toggleCheck = (i: number) => toggle(checked, checkKey, i)

function goTo(i: number) {
  document.getElementById(`seccion-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
const examen = () => router.push({ path: '/configurar', query: { source: id } })
const tarjetas = () => router.push({ path: '/estudiar', query: { sources: id } })
</script>

<template>
  <main class="mx-auto max-w-[440px] px-4 pb-32 pt-5 sm:max-w-2xl">
    <header class="flex items-center gap-3">
      <button class="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Volver" @click="router.back()">
        <PhArrowLeft :size="20" weight="bold" />
      </button>
      <span class="flex-1" />
    </header>

    <p v-if="error" class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>

    <template v-if="data">
      <!-- portada -->
      <section :class="['mt-4 rounded-card-lg p-6', color.solid]">
        <p class="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide opacity-60">
          <PhBookOpenText :size="16" weight="bold" /> Guía de estudio
        </p>
        <h1 class="mt-1 font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.02em]">{{ data.title }}</h1>
        <p v-if="guide" class="mt-2 text-[14px] font-semibold opacity-70">
          {{ guide.sections.length }} temas · {{ minutes }} min de lectura · {{ read.size }}/{{ guide.sections.length }} leídos
        </p>
        <div v-if="data.questions" class="mt-5 grid grid-cols-2 gap-2">
          <BaseButton size="md" @click="examen"><PhExam :size="18" weight="bold" /> Examen</BaseButton>
          <BaseButton size="md" variant="surface" @click="tarjetas"><PhCards :size="18" weight="bold" /> Tarjetas</BaseButton>
        </div>
      </section>

      <!-- preparándose -->
      <section v-if="data.status === 'generating' || data.status === 'none'" class="mt-8 flex flex-col items-center text-center">
        <motion.div :animate="{ rotate: [0, -6, 6, 0] }" :transition="{ duration: 2.4, repeat: Infinity }">
          <MascotBlob mood="thinking" :size="130" />
        </motion.div>
        <h2 class="mt-4 font-display text-[21px] font-extrabold">Mocca está leyendo todo el tema…</h2>
        <p class="mt-1.5 max-w-[320px] text-[14.5px] font-medium leading-snug text-ink-2">
          Te está armando el resumen completo, los términos y el mapa conceptual. Toma 1 o 2 minutos, y queda guardada.
        </p>
        <div class="mt-5 h-2.5 w-56 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            :class="['h-full w-1/3 rounded-full', color.bg]"
            :animate="{ x: ['-100%', '300%'] }"
            :transition="{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }"
          />
        </div>
      </section>

      <!-- falló -->
      <section v-else-if="data.status === 'error'" class="mt-8 flex flex-col items-center text-center">
        <MascotBlob mood="sad" :size="110" />
        <h2 class="mt-3 font-display text-[19px] font-extrabold">No pude armar la guía</h2>
        <p class="mt-1 max-w-[320px] text-[14px] font-medium text-ink-2">{{ data.error }}</p>
        <BaseButton class="mt-4" size="md" :loading="retrying" @click="retry"><PhArrowsClockwise :size="18" weight="bold" /> Intentar otra vez</BaseButton>
      </section>

      <template v-else-if="guide">
        <!-- pestañas -->
        <nav class="sticky top-0 z-20 -mx-4 mt-5 bg-bg/95 px-4 py-2 backdrop-blur" aria-label="Partes de la guía">
          <div class="flex gap-1 rounded-full bg-surface p-1 ring-1 ring-line">
            <button
              v-for="t in [
                { id: 'resumen', label: 'Resumen', icon: PhBookOpenText },
                { id: 'mapa', label: 'Mapa', icon: PhGraph },
                { id: 'repaso', label: 'Repaso', icon: PhListChecks },
              ] as const"
              :key="t.id"
              :class="['flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-[14px] font-bold transition-colors', tab === t.id ? 'bg-night text-white' : 'text-ink-2']"
              :aria-pressed="tab === t.id"
              @click="tab = t.id"
            >
              <component :is="t.icon" :size="17" weight="bold" /> {{ t.label }}
            </button>
          </div>
        </nav>

        <!-- RESUMEN -->
        <div v-if="tab === 'resumen'">
          <div class="mt-4 flex items-start gap-3">
            <MascotBlob mood="happy" :size="56" class="shrink-0" />
            <div class="rounded-[20px] rounded-tl-none bg-surface px-4 py-3 text-[15px] leading-relaxed ring-1 ring-line">
              <!-- eslint-disable-next-line vue/no-v-html -- richText escapa todo -->
              <p v-for="(p, i) in paragraphs(guide.overview)" :key="i" class="mt-2 first:mt-0" v-html="richText(p)" />
            </div>
          </div>

          <!-- índice -->
          <p class="mt-6 text-[12.5px] font-extrabold uppercase tracking-wide text-ink-2">Temas</p>
          <ol class="mt-2 flex flex-col gap-1.5">
            <li v-for="(s, i) in guide.sections" :key="i">
              <button class="flex w-full items-center gap-3 rounded-[16px] bg-surface px-3 py-2.5 text-left ring-1 ring-line" @click="goTo(i)">
                <span :class="['grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold', read.has(i) ? 'bg-mint text-on-color' : color.tint]">
                  <PhCheckCircle v-if="read.has(i)" :size="18" weight="fill" />
                  <template v-else>{{ i + 1 }}</template>
                </span>
                <span class="min-w-0 flex-1 text-[14.5px] font-bold leading-snug">{{ s.title }}</span>
                <span v-if="s.location" class="shrink-0 text-[11.5px] font-semibold text-ink-3">{{ s.location }}</span>
              </button>
            </li>
          </ol>

          <!-- secciones -->
          <article v-for="(s, i) in guide.sections" :id="`seccion-${i}`" :key="i" class="mt-8 scroll-mt-20">
            <div class="flex items-start gap-3">
              <span :class="['grid size-9 shrink-0 place-items-center rounded-full font-display text-[16px] font-extrabold', color.solid]">{{ i + 1 }}</span>
              <div class="min-w-0">
                <h2 class="font-display text-[22px] font-extrabold leading-tight tracking-[-0.01em]">{{ s.title }}</h2>
                <p v-if="s.location" class="mt-0.5 text-[12.5px] font-bold text-ink-3">{{ s.location }}</p>
              </div>
            </div>
            <GuideSectionBody class="mt-3" :section="s" :tint="color.tint" />
            <button
              :class="[
                'mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-[14.5px] font-bold transition-colors',
                read.has(i) ? 'bg-mint-tint text-success' : 'bg-surface ring-1 ring-line',
              ]"
              @click="toggleRead(i)"
            >
              <component :is="read.has(i) ? PhCheckCircle : PhCircle" :size="20" :weight="read.has(i) ? 'fill' : 'bold'" />
              {{ read.has(i) ? 'Leído' : 'Marcar como leído' }}
            </button>
          </article>

          <div class="mt-10 rounded-card bg-night p-5 text-white">
            <p class="font-display text-[19px] font-extrabold">¿Ya lo leíste todo?</p>
            <p class="mt-1 text-[14px] text-white/70">Ahora practica: el camino te pregunta tema por tema.</p>
            <BaseButton class="mt-4" size="md" @click="router.push('/camino')">Ir al camino</BaseButton>
          </div>
        </div>

        <!-- MAPA -->
        <div v-else-if="tab === 'mapa'" class="mt-5">
          <ConceptMap :center="guide.conceptMap.center || data.title" :branches="guide.conceptMap.branches" />
          <p class="mt-6 text-center text-[13px] font-medium text-ink-3">Toca un dato subrayado para ver su explicación.</p>
        </div>

        <!-- REPASO -->
        <div v-else class="mt-5">
          <h2 class="font-display text-[21px] font-extrabold">Antes del parcial debes poder…</h2>
          <p class="mt-1 text-[14px] text-ink-2">Marca lo que ya sabrías explicar sin mirar. Lo que no, vuelve a leerlo.</p>
          <ul class="mt-4 flex flex-col gap-2">
            <motion.li v-for="(c, i) in guide.checklist" :key="i" :initial="{ opacity: 0, y: 8 }" :animate="{ opacity: 1, y: 0 }" :transition="{ ...spring.card, delay: i * 0.03 }">
              <button
                :class="['flex w-full items-start gap-3 rounded-[18px] px-4 py-3 text-left ring-1 transition-colors', checked.has(i) ? 'bg-mint-tint ring-transparent' : 'bg-surface ring-line']"
                @click="toggleCheck(i)"
              >
                <component :is="checked.has(i) ? PhCheckCircle : PhCircle" :size="22" :weight="checked.has(i) ? 'fill' : 'bold'" :class="['shrink-0', checked.has(i) ? 'text-success' : 'text-ink-3']" />
                <span :class="['text-[15px] font-semibold leading-snug', checked.has(i) && 'text-ink-2']">{{ c }}</span>
              </button>
            </motion.li>
          </ul>
          <p v-if="guide.checklist.length && checked.size === guide.checklist.length" class="mt-5 flex items-center gap-3 rounded-[20px] bg-yellow-tint p-4 font-bold">
            <MascotBlob mood="celebrating" :size="56" /> ¡Lista para el parcial! Haz un examen para comprobarlo.
          </p>
        </div>
      </template>
    </template>

    <div v-else-if="!error" class="mt-24 flex justify-center"><MascotBlob mood="thinking" :size="100" /></div>
  </main>
</template>
