<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { motion } from 'motion-v'
import {
  PhArrowLeft,
  PhArrowsClockwise,
  PhBookOpenText,
  PhCalendarPlus,
  PhCaretDown,
  PhDotsThreeVertical,
  PhLightbulbFilament,
  PhLink,
  PhPlus,
} from '@phosphor-icons/vue'
import type { CalendarDTO, ExamEventDTO } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import PhoneCard from '@/components/PhoneCard.vue'
import SourcePicker from '@/components/collections/SourcePicker.vue'
import { api, ApiRequestError } from '@/api/client'
import { colorClasses, spring } from '@/lib/motion'
import { countdown, dayNum, hour, monthShort, urgency, whenText } from '@/lib/exams'
import { useSourcesStore } from '@/stores/sources'
import { useSound } from '@/composables/useSound'

/**
 * Mis parciales: el calendario de la U conectado (enlace iCal) y los parciales que agregó a mano.
 * Mocca avisa 7, 3, 2 y 1 día antes, el día del parcial, y cada mañana manda un dato curioso.
 */
const router = useRouter()
const sources = useSourcesStore()
const { play } = useSound()
const cal = ref<CalendarDTO | null>(null)
const error = ref('')
const busy = ref<'' | 'connect' | 'sync' | 'add' | 'save'>('')

onMounted(async () => {
  try {
    const [c] = await Promise.all([api.calendar(), sources.loaded ? null : sources.fetchAll()])
    cal.value = c
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude abrir tus parciales.'
  }
})

const ready = computed(() => sources.list.filter((s) => s.status === 'ready'))
const titleOf = (id: string) => sources.byId.get(id)?.title ?? 'Fuente'
const colorOf = (id: string) => colorClasses[sources.byId.get(id)?.color ?? 'lilac']
const next = computed(() => cal.value?.exams[0] ?? null)

function study(e: ExamEventDTO) {
  if (e.sourceIds[0]) router.push(`/guia/${e.sourceIds[0]}`)
  else openSources(e)
}

async function run(kind: typeof busy.value, fn: () => Promise<CalendarDTO | void>) {
  busy.value = kind
  error.value = ''
  try {
    const r = await fn()
    if (r) cal.value = r
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'Algo salió mal. Intenta de nuevo.'
  } finally {
    busy.value = ''
  }
}

// ── conectar el calendario ──
const link = ref('')
const help = ref<'' | 'google' | 'moodle' | 'outlook'>('')
const connect = () =>
  run('connect', async () => {
    const r = await api.connectCalendar(link.value.trim())
    link.value = ''
    play('correct')
    return r
  })
const sync = () => run('sync', () => api.syncCalendar())
const disconnect = () => {
  if (!confirm('¿Desconectar el calendario? Los parciales que agregaste a mano se quedan.')) return
  return run('sync', () => api.disconnectCalendar())
}
const synced = computed(() => {
  const at = cal.value?.feed.lastSyncedAt
  if (!at) return 'nunca'
  const min = Math.round((Date.now() - new Date(at).getTime()) / 60_000)
  return min < 1 ? 'hace un momento' : min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`
})

// ── agregar a mano ──
const adding = ref(false)
const form = ref({ title: '', date: '', time: '', sourceIds: [] as string[] })
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
function openAdd() {
  form.value = { title: '', date: '', time: '', sourceIds: [] }
  adding.value = true
}
const add = () =>
  run('add', async () => {
    const f = form.value
    await api.addExam({ title: f.title.trim(), date: f.date, ...(f.time ? { time: f.time } : {}), sourceIds: f.sourceIds })
    adding.value = false
    play('correct')
    return api.calendar()
  })

// ── fuentes de un parcial ──
const editing = ref<ExamEventDTO | null>(null)
const picked = ref<string[]>([])
function openSources(e: ExamEventDTO) {
  editing.value = e
  picked.value = [...e.sourceIds]
}
const saveSources = () =>
  run('save', async () => {
    await api.updateExam(editing.value!.id, { sourceIds: picked.value })
    editing.value = null
    return api.calendar()
  })

// ── menú: no es un parcial / borrar ──
const menuFor = ref<string | null>(null)
const remove = (e: ExamEventDTO) =>
  run('save', async () => {
    menuFor.value = null
    await api.deleteExam(e.id)
    return api.calendar()
  })

const toggleFacts = () =>
  run('save', async () => {
    const on = !cal.value!.dailyFacts
    await api.setDailyFacts(on)
    cal.value!.dailyFacts = on
  })
</script>

<template>
  <main class="mx-auto max-w-[440px] px-4 pb-32 pt-5 sm:max-w-2xl">
    <header class="flex items-center gap-3">
      <button class="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Volver" @click="router.back()">
        <PhArrowLeft :size="20" weight="bold" />
      </button>
      <h1 class="flex-1 font-display text-[24px] font-extrabold tracking-[-0.02em]">Mis parciales</h1>
      <button class="flex h-11 items-center gap-1.5 rounded-full bg-surface px-4 text-[14px] font-bold ring-1 ring-line" @click="openAdd">
        <PhPlus :size="17" weight="bold" /> Agregar
      </button>
    </header>

    <p v-if="error" class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>

    <template v-if="cal">
      <!-- el próximo, en grande -->
      <section v-if="next" :class="['relative mt-5 overflow-hidden rounded-card-lg p-6 pr-32 text-on-color', urgency(next)]">
        <MascotBlob class="pointer-events-none absolute -bottom-3 -right-2" :mood="next.daysLeft <= 1 ? 'proud' : 'thinking'" :size="130" />
        <p class="text-[13px] font-bold uppercase tracking-wide opacity-70">Tu próximo parcial</p>
        <h2 class="mt-1 font-display text-[24px] font-extrabold leading-[1.05]">{{ next.title }}</h2>
        <p class="mt-2 font-display text-[30px] font-extrabold leading-none">{{ countdown(next) }}</p>
        <p class="mt-1 text-[13.5px] font-semibold opacity-75">{{ whenText(next) }}</p>
        <BaseButton class="mt-4" size="md" @click="study(next)">
          <PhBookOpenText :size="18" weight="bold" /> {{ next.sourceIds.length ? 'Repasar ahora' : 'Elegir qué estudiar' }}
        </BaseButton>
      </section>

      <PhoneCard />

      <!-- lista -->
      <h2 v-if="cal.exams.length > 1" class="mt-7 text-[20px] font-bold">Los que vienen</h2>
      <ul class="mt-3 flex flex-col gap-2.5">
        <motion.li
          v-for="(e, i) in cal.exams.slice(next ? 1 : 0)"
          :key="e.id"
          class="relative rounded-[22px] bg-surface p-3.5 ring-1 ring-line"
          :initial="{ opacity: 0, y: 10 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ ...spring.card, delay: i * 0.04 }"
        >
          <div class="flex items-start gap-3">
            <span :class="['flex w-[52px] shrink-0 flex-col items-center rounded-[16px] py-1.5 text-on-color', urgency(e)]">
              <span class="font-display text-[22px] font-extrabold leading-none">{{ dayNum(e.startsAt) }}</span>
              <span class="text-[11.5px] font-bold uppercase">{{ monthShort(e.startsAt) }}</span>
            </span>
            <div class="min-w-0 flex-1">
              <p class="font-display text-[16.5px] font-extrabold leading-tight">{{ e.title }}</p>
              <p class="mt-0.5 text-[13px] font-semibold text-ink-2">
                {{ countdown(e) }}{{ e.allDay ? '' : ` · ${hour(e.startsAt)}` }} · {{ e.origin === 'manual' ? 'agregado por ti' : 'de tu calendario' }}
              </p>
            </div>
            <button class="grid size-9 shrink-0 place-items-center rounded-full" :aria-label="`Opciones de ${e.title}`" @click="menuFor = menuFor === e.id ? null : e.id">
              <PhDotsThreeVertical :size="20" weight="bold" />
            </button>
          </div>
          <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
            <button
              v-for="id in e.sourceIds.slice(0, 3)"
              :key="id"
              :class="['max-w-[180px] truncate rounded-full px-2.5 py-1 text-[12.5px] font-bold', colorOf(id).tint]"
              @click="router.push(`/guia/${id}`)"
            >
              {{ titleOf(id) }}
            </button>
            <span v-if="e.sourceIds.length > 3" class="text-[12.5px] font-bold text-ink-2">+{{ e.sourceIds.length - 3 }}</span>
            <button class="rounded-full px-2.5 py-1 text-[12.5px] font-bold text-lilac underline" @click="openSources(e)">
              {{ e.sourceIds.length ? 'Cambiar fuentes' : 'Elegir fuentes para repasar' }}
            </button>
          </div>
          <div v-if="menuFor === e.id" class="absolute right-3 top-12 z-10 w-56 rounded-[18px] bg-surface p-1.5 shadow-float ring-1 ring-line">
            <button class="w-full rounded-[12px] px-3 py-2.5 text-left text-[14px] font-bold" @click="remove(e)">
              {{ e.origin === 'calendar' ? 'No es un parcial (ocultar)' : 'Borrar' }}
            </button>
          </div>
        </motion.li>
      </ul>

      <button
        v-if="!cal.exams.length"
        class="mt-6 flex w-full flex-col items-center rounded-card border-[2.5px] border-dashed border-ink/15 px-6 py-8 text-center"
        @click="openAdd"
      >
        <MascotBlob mood="happy" :size="96" />
        <span class="mt-3 font-display text-[18px] font-bold">No hay parciales a la vista</span>
        <span class="mt-1 text-[14px] font-medium text-ink-2">Conecta tu calendario abajo o toca para agregar uno.</span>
      </button>

      <!-- calendario conectado -->
      <section class="mt-8 rounded-card bg-surface p-5 ring-1 ring-line">
        <p class="flex items-center gap-2 font-display text-[18px] font-extrabold"><PhLink :size="20" weight="bold" /> Calendario de la U</p>
        <template v-if="cal.feed.connected">
          <p class="mt-1 text-[14px] text-ink-2">
            Conectado ({{ cal.feed.hint }}). Lo reviso todos los días; última vez {{ synced }}.
          </p>
          <p v-if="cal.feed.error" class="mt-2 rounded-[14px] bg-pink-tint px-3 py-2 text-[13.5px] font-semibold">{{ cal.feed.error }}</p>
          <div class="mt-4 flex gap-2">
            <BaseButton size="md" variant="surface" :loading="busy === 'sync'" @click="sync"><PhArrowsClockwise :size="17" weight="bold" /> Actualizar</BaseButton>
            <button class="px-3 text-[14px] font-bold text-danger" @click="disconnect">Desconectar</button>
          </div>
        </template>
        <template v-else>
          <p class="mt-1 text-[14px] leading-snug text-ink-2">
            Pega el enlace privado (iCal) de tu calendario y Mocca encontrará tus parciales, quices y exámenes solita.
          </p>
          <input
            v-model="link"
            type="url"
            inputmode="url"
            placeholder="https://… o webcal://…"
            class="mt-3 h-12 w-full rounded-[16px] bg-bg px-4 text-[15px] ring-1 ring-line focus:outline-none focus:ring-[2.5px] focus:ring-lilac"
            @keydown.enter="link.trim() && connect()"
          />
          <BaseButton class="mt-3" size="md" block :disabled="!link.trim()" :loading="busy === 'connect'" @click="connect">Conectar</BaseButton>

          <p class="mt-4 text-[13px] font-bold text-ink-2">¿Dónde encuentro el enlace?</p>
          <div class="mt-2 flex flex-col gap-1.5">
            <div v-for="h in [
              { id: 'google', label: 'Google Calendar' },
              { id: 'moodle', label: 'Aula virtual (Moodle)' },
              { id: 'outlook', label: 'Outlook / correo de la U' },
            ] as const" :key="h.id" class="rounded-[16px] bg-bg ring-1 ring-line">
              <button class="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[14px] font-bold" :aria-expanded="help === h.id" @click="help = help === h.id ? '' : h.id">
                {{ h.label }} <PhCaretDown :size="16" weight="bold" :class="['transition-transform', help === h.id && 'rotate-180']" />
              </button>
              <ol v-if="help === h.id" class="list-decimal px-8 pb-3 text-[13.5px] leading-snug text-ink-2">
                <template v-if="h.id === 'google'">
                  <li>En un computador abre calendar.google.com.</li>
                  <li>En "Mis calendarios", pasa el mouse por tu calendario → ⋮ → <b>Configuración y uso compartido</b>.</li>
                  <li>Baja hasta "Integrar el calendario" y copia la <b>Dirección secreta en formato iCal</b>.</li>
                </template>
                <template v-else-if="h.id === 'moodle'">
                  <li>Entra al aula virtual y abre el <b>Calendario</b>.</li>
                  <li>Abajo toca <b>Exportar calendario</b> (o "Importar o exportar calendarios").</li>
                  <li>Elige "Todos los cursos" y "Eventos recientes y próximos", y toca <b>Obtener URL del calendario</b>. Copia ese enlace.</li>
                </template>
                <template v-else>
                  <li>En outlook.office.com ve a Configuración ⚙️ → Calendario → <b>Calendarios compartidos</b>.</li>
                  <li>En "Publicar un calendario" elige tu calendario y "Puede ver todos los detalles" → <b>Publicar</b>.</li>
                  <li>Copia el enlace <b>ICS</b>.</li>
                </template>
              </ol>
            </div>
          </div>
          <p class="mt-3 text-[12.5px] text-ink-3">El enlace es privado: solo Moccapp lo usa para leer tus fechas.</p>
        </template>
      </section>

      <!-- datos curiosos -->
      <button class="mt-3 flex w-full items-center gap-3 rounded-card bg-surface p-4 text-left ring-1 ring-line" role="switch" :aria-checked="cal.dailyFacts" @click="toggleFacts">
        <PhLightbulbFilament :size="26" weight="fill" class="shrink-0 text-yellow" />
        <span class="min-w-0 flex-1">
          <span class="block text-[15px] font-bold">Dato curioso cada mañana</span>
          <span class="block text-[13px] leading-snug text-ink-2">Un dato de lo que estás estudiando (del próximo parcial, si hay uno cerca).</span>
        </span>
        <span :class="['relative h-7 w-12 shrink-0 rounded-full transition-colors', cal.dailyFacts ? 'bg-mint' : 'bg-surface-2 ring-1 ring-line']">
          <span :class="['absolute top-1 size-5 rounded-full bg-white shadow transition-all', cal.dailyFacts ? 'left-6' : 'left-1']" />
        </span>
      </button>
      <p class="mt-3 px-1 text-[12.5px] leading-snug text-ink-3">
        Mocca te avisa 7, 3, 2 y 1 día antes de cada parcial (en la noche) y te da ánimo la mañana del parcial.
      </p>
    </template>

    <div v-else-if="!error" class="mt-24 flex justify-center"><MascotBlob mood="thinking" :size="100" /></div>

    <!-- agregar parcial -->
    <BottomSheet :open="adding" title="Agregar parcial" @close="adding = false">
      <label class="block text-[13px] font-bold text-ink-2">Materia o nombre</label>
      <input
        v-model="form.title"
        maxlength="120"
        placeholder="Parcial 2 de Bioquímica"
        class="mt-1 h-12 w-full rounded-[16px] bg-surface px-4 text-[16px] font-semibold ring-1 ring-line focus:outline-none focus:ring-[2.5px] focus:ring-lilac"
      />
      <div class="mt-3 grid grid-cols-2 gap-2">
        <label class="block">
          <span class="text-[13px] font-bold text-ink-2">Fecha</span>
          <input v-model="form.date" type="date" :min="today" class="mt-1 h-12 w-full rounded-[16px] bg-surface px-3 text-[15px] ring-1 ring-line" />
        </label>
        <label class="block">
          <span class="text-[13px] font-bold text-ink-2">Hora (opcional)</span>
          <input v-model="form.time" type="time" class="mt-1 h-12 w-full rounded-[16px] bg-surface px-3 text-[15px] ring-1 ring-line" />
        </label>
      </div>
      <p class="mt-4 text-[13px] font-bold text-ink-2">¿Con qué fuentes repasas? <span class="font-medium">(si no eliges, Mocca las busca por el nombre)</span></p>
      <div class="mt-2"><SourcePicker v-model="form.sourceIds" :sources="ready" /></div>
      <div class="h-2" />
      <template #footer>
        <BaseButton size="xl" block :disabled="form.title.trim().length < 2 || !form.date" :loading="busy === 'add'" @click="add">
          <PhCalendarPlus :size="20" weight="bold" /> Guardar parcial
        </BaseButton>
      </template>
    </BottomSheet>

    <!-- fuentes de un parcial -->
    <BottomSheet :open="!!editing" :title="editing ? `Repasar para: ${editing.title}` : ''" @close="editing = null">
      <SourcePicker v-model="picked" :sources="ready" />
      <div class="h-2" />
      <template #footer>
        <BaseButton size="xl" block :loading="busy === 'save'" @click="saveSources">Guardar</BaseButton>
      </template>
    </BottomSheet>
  </main>
</template>
