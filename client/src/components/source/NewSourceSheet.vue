<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { AnimatePresence, motion } from 'motion-v'
import {
  PhArrowRight,
  PhArrowsClockwise,
  PhCamera,
  PhCheckCircle,
  PhFileArrowUp,
  PhLink,
  PhPlus,
  PhTextAa,
  PhX,
  PhYoutubeLogo,
} from '@phosphor-icons/vue'
import { parseYoutubeId, type SourceDTO } from '@vetquiz/shared'
import { api, ApiRequestError } from '@/api/client'
import { useSourcesStore } from '@/stores/sources'
import { useUiStore } from '@/stores/ui'
import { spring } from '@/lib/motion'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import FileBadge from './FileBadge.vue'
import ProcessingMessages from './ProcessingMessages.vue'

/**
 * Popup "Nueva fuente": hoja inferior en celular, ventana centrada en computador.
 * Pasos: formulario → subiendo (con %) → Mocca estudiando (Gemini genera el banco) → listo / error.
 * Se pueden subir VARIOS archivos de una vez (p. ej. todas las presentaciones de una materia): cada uno
 * queda como su propia carpeta y "Armar examen" las trae todas seleccionadas para mezclarlas.
 * Se puede cerrar mientras procesa: las fuentes siguen en segundo plano y aparecen en Inicio.
 */
type Tab = 'file' | 'text' | 'youtube'
type Step = 'form' | 'uploading' | 'processing' | 'ready' | 'error'

const ui = useUiStore()
const sources = useSourcesStore()
const router = useRouter()

const MAX_MB = 150
const MAX_FILES = 10
const ACCEPT = '.pdf,.docx,.pptx,.txt,.md,image/*,.heic,.heif'
const OK_EXT = /\.(pdf|docx|pptx|txt|md|jpe?g|png|webp|heic|heif)$/i

const tab = ref<Tab>('file')
const step = ref<Step>('form')
const title = ref('')
const files = ref<File[]>([])
const text = ref('')
const url = ref('')
const urlTouched = ref(false)
const dragging = ref(false)
const formError = ref<string | null>(null)
const progress = ref(0)
const uploadIndex = ref(0)
const sourceIds = ref<string[]>([])
const deduplicated = ref(new Set<string>())
const uploadErrors = ref<{ name: string; message: string }[]>([])
const busy = ref(false)
let abort: AbortController | null = null

const fileInput = ref<HTMLInputElement>()
const cameraInput = ref<HTMLInputElement>()

const srcs = computed(() => sourceIds.value.map((id) => sources.byId.get(id)).filter((x): x is SourceDTO => !!x))
const source = computed(() => srcs.value[0])
const many = computed(() => srcs.value.length > 1)
const readySrcs = computed(() => srcs.value.filter((x) => x.status === 'ready'))
const failedSrcs = computed(() => srcs.value.filter((x) => x.status === 'error'))
const videoId = computed(() => parseYoutubeId(url.value))
const textLen = computed(() => text.value.trim().length)

const canSubmit = computed(() => {
  if (tab.value === 'file') return files.value.length > 0
  if (tab.value === 'text') return textLen.value >= 200
  return !!videoId.value
})

// El paso sigue al estado real de las fuentes (el store las consulta cada 2.5 s)
watch(srcs, (list) => {
  if (!list.length || step.value === 'form' || step.value === 'uploading') return
  if (list.some((x) => x.status === 'processing')) step.value = 'processing'
  else step.value = list.some((x) => x.status === 'ready') ? 'ready' : 'error'
})

function reset() {
  step.value = 'form'
  title.value = ''
  files.value = []
  text.value = ''
  url.value = ''
  urlTouched.value = false
  formError.value = null
  progress.value = 0
  uploadIndex.value = 0
  sourceIds.value = []
  deduplicated.value = new Set()
  uploadErrors.value = []
  busy.value = false
}

// Al abrir: si lo anterior ya terminó, formulario limpio; si sigue procesando, se muestra ese progreso
watch(
  () => ui.newSourceOpen,
  async (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (!open) return
    if (step.value === 'ready' || step.value === 'error') reset()
    else if (step.value === 'form') formError.value = null
    await nextTick()
    document.querySelector<HTMLElement>('[role=dialog] [data-autofocus]')?.focus()
  },
)
onBeforeUnmount(() => (document.body.style.overflow = ''))

function close() {
  if (step.value === 'uploading') abort?.abort()
  ui.closeNewSource()
}

// ── Archivos ─────────────────────────────────────────────────

function problemWith(f: File): string | null {
  if (/\.(doc|ppt)$/i.test(f.name)) return 'es .doc o .ppt viejo (guárdalo como .docx/.pptx o PDF)'
  if (!OK_EXT.test(f.name) && !f.type.startsWith('image/')) return 'ese tipo de archivo no se puede leer'
  if (f.size > MAX_MB * 1024 * 1024) return `pesa más de ${MAX_MB} MB`
  return null
}

/** Agrega uno o varios archivos; los que no sirven se explican sin bloquear a los demás */
function addFiles(list: FileList | File[] | null | undefined) {
  formError.value = null
  const incoming = [...(list ?? [])]
  const bad: string[] = []
  for (const f of incoming) {
    const problem = problemWith(f)
    if (problem) bad.push(`«${f.name}» ${problem}`)
    else if (!files.value.some((x) => x.name === f.name && x.size === f.size)) files.value.push(f)
  }
  if (files.value.length > MAX_FILES) {
    files.value = files.value.slice(0, MAX_FILES)
    bad.push(`máximo ${MAX_FILES} archivos por vez`)
  }
  if (bad.length) formError.value = `No agregué: ${bad.join('; ')}.`
}

function onDrop(e: DragEvent) {
  dragging.value = false
  addFiles(e.dataTransfer?.files)
}

function onPicked(e: Event) {
  const input = e.target as HTMLInputElement
  addFiles(input.files)
  input.value = '' // permite volver a elegir el mismo archivo
}

// Pegar una captura de pantalla con Ctrl/Cmd+V también sirve
function onPaste(e: ClipboardEvent) {
  if (!ui.newSourceOpen || step.value !== 'form' || tab.value !== 'file') return
  const img = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
  if (img) addFiles([new File([img], `captura-${Date.now()}.png`, { type: img.type })])
}
window.addEventListener('paste', onPaste)
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))

// ── Enviar ───────────────────────────────────────────────────

async function submit() {
  if (!canSubmit.value || busy.value) return
  busy.value = true
  formError.value = null
  uploadErrors.value = []
  const name = title.value.trim() || undefined
  try {
    if (tab.value === 'file') {
      step.value = 'uploading'
      abort = new AbortController()
      // uno por uno: así el porcentaje es real y si uno falla los demás siguen
      for (const [i, f] of files.value.entries()) {
        uploadIndex.value = i
        progress.value = 0
        try {
          const res = await api.uploadSource(f, {
            title: files.value.length === 1 ? name : undefined,
            onProgress: (r) => (progress.value = r),
            signal: abort.signal,
          })
          sources.upsert(res.source)
          sourceIds.value.push(res.source.id)
          if (res.deduplicated) deduplicated.value.add(res.source.id)
        } catch (err) {
          if (err instanceof ApiRequestError && err.code === 'ABORTED') throw err
          uploadErrors.value.push({ name: f.name, message: err instanceof ApiRequestError ? err.message : 'No se pudo subir.' })
        }
      }
      if (!sourceIds.value.length) {
        step.value = 'form'
        formError.value = uploadErrors.value.map((e) => `«${e.name}»: ${e.message}`).join(' ')
        return
      }
    } else {
      const res = tab.value === 'text' ? await api.createTextSource(text.value, name) : await api.createYoutubeSource(url.value, name)
      sources.upsert(res.source)
      sourceIds.value = [res.source.id]
      if (res.deduplicated) deduplicated.value.add(res.source.id)
    }
    const list = srcs.value
    step.value = list.some((x) => x.status === 'processing') ? 'processing' : list.some((x) => x.status === 'ready') ? 'ready' : 'error'
  } catch (err) {
    step.value = 'form'
    if (!(err instanceof ApiRequestError && err.code === 'ABORTED'))
      formError.value = err instanceof ApiRequestError ? err.message : 'Algo salió mal. Intenta de nuevo.'
  } finally {
    busy.value = false
  }
}

async function retry(id?: string) {
  const ids = id ? [id] : failedSrcs.value.map((x) => x.id)
  if (!ids.length) return
  busy.value = true
  try {
    for (const one of ids) sources.upsert(await api.retrySource(one))
    step.value = 'processing'
  } catch (err) {
    formError.value = err instanceof ApiRequestError ? err.message : 'No se pudo reintentar.'
  } finally {
    busy.value = false
  }
}

function goConfigure() {
  const ids = readySrcs.value.map((x) => x.id)
  ui.closeNewSource()
  reset()
  router.push({ path: '/configurar', query: { sources: ids.join(',') } })
}

const kindLabel = computed(() =>
  tab.value === 'youtube' ? 'el video' : tab.value === 'text' ? 'tu texto' : many.value ? `tus ${srcs.value.length} archivos` : 'tus apuntes',
)
const tabs = [
  { id: 'file' as const, label: 'Archivo', icon: PhFileArrowUp },
  { id: 'text' as const, label: 'Texto', icon: PhTextAa },
  { id: 'youtube' as const, label: 'YouTube', icon: PhYoutubeLogo },
]
const fmtMb = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`)
const totalSize = computed(() => files.value.reduce((a, f) => a + f.size, 0))
</script>

<template>
  <AnimatePresence>
    <div v-if="ui.newSourceOpen" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" @keydown.esc="close">
      <!-- fondo -->
      <motion.div
        class="absolute inset-0 bg-[#16141c]/55 backdrop-blur-[2px]"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        @click="close"
      />

      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-source-title"
        class="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[34px] bg-bg sm:max-w-[480px] sm:rounded-[34px]"
        :initial="{ y: '100%' }"
        :animate="{ y: 0 }"
        :exit="{ y: '100%' }"
        :transition="spring.card"
      >
        <!-- agarradera (celular) -->
        <div class="flex justify-center pt-3 sm:hidden" aria-hidden="true">
          <span class="h-1.5 w-11 rounded-full bg-ink/15" />
        </div>

        <header class="flex items-center justify-between px-5 pb-1 pt-3 sm:pt-6">
          <h2 id="new-source-title" class="text-title font-extrabold">
            {{ step === 'ready' ? '¡Lista!' : step === 'form' ? 'Nueva fuente' : step === 'error' ? 'Ups' : 'Estudiando…' }}
          </h2>
          <button class="grid size-11 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Cerrar" @click="close">
            <PhX :size="20" weight="bold" />
          </button>
        </header>

        <div class="flex-1 overflow-y-auto px-5 pb-5 pt-3">
          <AnimatePresence mode="wait">
            <!-- ── Formulario ── -->
            <motion.div
              v-if="step === 'form'"
              key="form"
              :initial="{ opacity: 0, y: 12 }"
              :animate="{ opacity: 1, y: 0 }"
              :exit="{ opacity: 0, y: -12 }"
              :transition="spring.card"
            >
              <!-- pestañas -->
              <div class="grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1" role="tablist" aria-label="Tipo de fuente">
                <button
                  v-for="t in tabs"
                  :key="t.id"
                  role="tab"
                  :aria-selected="tab === t.id"
                  class="relative flex h-11 items-center justify-center gap-1.5 rounded-full font-display text-[15px] font-bold"
                  :class="tab === t.id ? 'text-ink' : 'text-ink-2'"
                  :data-autofocus="tab === t.id ? '' : undefined"
                  @click="(tab = t.id), (formError = null)"
                >
                  <motion.span
                    v-if="tab === t.id"
                    layout-id="source-tab"
                    class="absolute inset-0 rounded-full bg-surface shadow-soft"
                    :transition="spring.press"
                  />
                  <component :is="t.icon" :size="18" weight="bold" class="relative" />
                  <span class="relative">{{ t.label }}</span>
                </button>
              </div>

              <!-- Archivo -->
              <div v-if="tab === 'file'" class="mt-4">
                <div
                  v-if="!files.length"
                  :class="[
                    'flex flex-col items-center rounded-[28px] border-[2.5px] border-dashed px-5 pb-5 pt-6 text-center transition-colors duration-150',
                    dragging ? 'border-lilac bg-lilac-tint' : 'border-ink/15 bg-surface',
                  ]"
                  @dragover.prevent="dragging = true"
                  @dragleave.prevent="dragging = false"
                  @drop.prevent="onDrop"
                >
                  <!-- hojitas tipo sticker -->
                  <div class="relative h-[86px] w-40" aria-hidden="true">
                    <span class="absolute left-3 top-4 -rotate-12"><FileBadge format="pptx" /></span>
                    <span class="absolute right-3 top-4 rotate-12"><FileBadge format="image" /></span>
                    <span class="absolute left-1/2 top-0 -translate-x-1/2"><FileBadge format="pdf" /></span>
                  </div>
                  <p class="mt-3 font-display text-[19px] font-bold leading-tight">
                    <span class="hidden sm:inline">Arrastra tus archivos aquí</span>
                    <span class="sm:hidden">Sube tus apuntes</span>
                  </p>
                  <p class="mt-1 text-[13px] font-medium text-ink-2">PDF, Word, PowerPoint, fotos o .txt · puedes elegir varios</p>
                  <div class="mt-5 grid w-full grid-cols-2 gap-2">
                    <BaseButton variant="surface" size="md" @click="fileInput?.click()">
                      <PhFileArrowUp :size="18" weight="bold" /> Elegir archivos
                    </BaseButton>
                    <BaseButton size="md" @click="cameraInput?.click()">
                      <PhCamera :size="18" weight="bold" /> Tomar foto
                    </BaseButton>
                  </div>
                </div>

                <div
                  v-else
                  class="flex flex-col gap-2"
                  @dragover.prevent="dragging = true"
                  @dragleave.prevent="dragging = false"
                  @drop.prevent="onDrop"
                >
                  <motion.div
                    v-for="(f, i) in files"
                    :key="f.name + f.size"
                    class="flex items-center gap-3 rounded-[22px] bg-surface p-2.5 pr-2 ring-1 ring-line"
                    :initial="{ scale: 0.96, opacity: 0 }"
                    :animate="{ scale: 1, opacity: 1 }"
                    :transition="spring.jelly"
                  >
                    <FileBadge :name="f.name" :mime="f.type" />
                    <div class="min-w-0 flex-1">
                      <p class="truncate font-display text-[15px] font-bold">{{ f.name }}</p>
                      <p class="text-[12.5px] font-medium text-ink-2">
                        {{ fmtMb(f.size) }}
                        <template v-if="/\.pdf$/i.test(f.name) && f.size > 40 * 1024 * 1024"> · lo leo por partes, completo</template>
                      </p>
                    </div>
                    <button class="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2" :aria-label="`Quitar ${f.name}`" @click="files.splice(i, 1)">
                      <PhX :size="15" weight="bold" />
                    </button>
                  </motion.div>
                  <div class="grid grid-cols-2 gap-2">
                    <BaseButton variant="surface" size="md" :disabled="files.length >= MAX_FILES" @click="fileInput?.click()">
                      <PhPlus :size="16" weight="bold" /> Agregar más
                    </BaseButton>
                    <BaseButton variant="surface" size="md" :disabled="files.length >= MAX_FILES" @click="cameraInput?.click()">
                      <PhCamera :size="16" weight="bold" /> Foto
                    </BaseButton>
                  </div>
                  <p v-if="files.length > 1" class="px-1 text-[13px] font-medium text-ink-2">
                    {{ files.length }} archivos · {{ fmtMb(totalSize) }}. Cada uno queda como su carpeta y luego armas un examen que los mezcla.
                  </p>
                </div>
                <input ref="fileInput" type="file" multiple class="hidden" :accept="ACCEPT" @change="onPicked" />
                <input ref="cameraInput" type="file" class="hidden" accept="image/*" capture="environment" @change="onPicked" />
              </div>

              <!-- Texto -->
              <div v-else-if="tab === 'text'" class="mt-4">
                <textarea
                  v-model="text"
                  rows="8"
                  class="block w-full resize-none rounded-[24px] bg-surface p-4 text-[15px] leading-relaxed ring-1 ring-line placeholder:text-ink-3 focus:outline-none focus:ring-[2.5px] focus:ring-lilac"
                  placeholder="Pega aquí tus apuntes, un resumen o un capítulo del libro…"
                  aria-label="Texto de estudio"
                />
                <p class="mt-2 flex items-center justify-between px-1 text-[13px] font-semibold">
                  <span :class="textLen >= 200 ? 'text-success' : 'text-ink-3'">
                    {{ textLen >= 200 ? '¡Suficiente para un examen!' : `Mínimo 200 caracteres` }}
                  </span>
                  <span class="tabular-nums text-ink-3">{{ textLen.toLocaleString('es-CO') }}</span>
                </p>
              </div>

              <!-- YouTube -->
              <div v-else class="mt-4">
                <label class="flex h-14 items-center gap-2 rounded-full bg-surface px-4 ring-1 ring-line focus-within:ring-[2.5px] focus-within:ring-lilac">
                  <PhLink :size="20" weight="bold" class="shrink-0 text-ink-3" />
                  <input
                    v-model="url"
                    type="url"
                    inputmode="url"
                    class="h-full min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-ink-3 focus:outline-none"
                    placeholder="https://youtu.be/…"
                    aria-label="Link de YouTube"
                    @blur="urlTouched = true"
                  />
                </label>
                <p v-if="urlTouched && url && !videoId" class="mt-2 px-2 text-[13px] font-semibold text-danger">
                  Ese link no parece de un video de YouTube.
                </p>
                <motion.div
                  v-if="videoId"
                  :key="videoId"
                  class="relative mt-3 overflow-hidden rounded-[24px] bg-night"
                  :initial="{ opacity: 0, scale: 0.97 }"
                  :animate="{ opacity: 1, scale: 1 }"
                  :transition="spring.card"
                >
                  <img :src="`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`" alt="" class="aspect-video w-full object-cover opacity-90" />
                  <span class="absolute inset-0 grid place-items-center">
                    <span class="grid h-12 w-[68px] place-items-center rounded-2xl bg-[#ff3b30]">
                      <span class="ml-1 border-y-[10px] border-l-[16px] border-y-transparent border-l-white" />
                    </span>
                  </span>
                </motion.div>
                <p class="mt-2 px-2 text-[13px] font-medium text-ink-2">Solo videos públicos. Mocca escucha el audio y mira las diapositivas.</p>
              </div>

              <!-- Nombre (con varios archivos, Mocca titula cada uno) -->
              <label v-if="tab !== 'file' || files.length <= 1" class="mt-4 block">
                <span class="px-1 text-[13px] font-bold text-ink-2">Nombre (opcional)</span>
                <input
                  v-model="title"
                  maxlength="120"
                  class="mt-1.5 block h-12 w-full rounded-full bg-surface px-4 text-[15px] ring-1 ring-line placeholder:text-ink-3 focus:outline-none focus:ring-[2.5px] focus:ring-lilac"
                  placeholder="Si lo dejas vacío, Mocca le pone uno"
                />
              </label>

              <motion.p
                v-if="formError"
                role="alert"
                class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold text-ink"
                :initial="{ x: 0 }"
                :animate="{ x: [0, -6, 6, -3, 0] }"
              >
                {{ formError }}
              </motion.p>
            </motion.div>

            <!-- ── Subiendo / Procesando ── -->
            <motion.div
              v-else-if="step === 'uploading' || step === 'processing'"
              key="working"
              class="flex flex-col items-center py-4 text-center"
              :initial="{ opacity: 0, y: 12 }"
              :animate="{ opacity: 1, y: 0 }"
              :exit="{ opacity: 0, y: -12 }"
              :transition="spring.card"
            >
              <MascotBlob mood="thinking" :size="150" />
              <template v-if="step === 'uploading'">
                <p class="mt-4 font-display text-[22px] font-bold">
                  Subiendo<template v-if="files.length > 1"> {{ uploadIndex + 1 }} de {{ files.length }}</template>… {{ Math.round(progress * 100) }}%
                </p>
                <p v-if="files.length > 1" class="mt-1 max-w-[320px] truncate text-[13px] font-medium text-ink-2">{{ files[uploadIndex]?.name }}</p>
                <div class="mt-4 h-3 w-full max-w-[300px] overflow-hidden rounded-full bg-ink/10">
                  <motion.div class="h-full rounded-full bg-lilac" :animate="{ width: `${progress * 100}%` }" :transition="spring.fill" />
                </div>
              </template>
              <template v-else>
                <p class="mt-4 font-display text-[22px] font-bold leading-tight">Mocca está estudiando {{ kindLabel }}</p>
                <ProcessingMessages class="mt-2" :video="tab === 'youtube'" />
                <div class="vq-indeterminate mt-5 h-3 w-full max-w-[300px] overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-label="Generando preguntas" />
                <ul v-if="many" class="mt-5 flex w-full flex-col gap-1.5 text-left">
                  <li v-for="x in srcs" :key="x.id" class="flex items-center gap-2 rounded-[16px] bg-surface px-3 py-2 ring-1 ring-line">
                    <PhCheckCircle v-if="x.status === 'ready'" :size="18" weight="fill" class="shrink-0 text-success" />
                    <PhX v-else-if="x.status === 'error'" :size="18" weight="bold" class="shrink-0 text-danger" />
                    <span v-else class="size-4 shrink-0 animate-spin rounded-full border-[2.5px] border-lilac border-r-transparent" />
                    <span class="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{{ x.title }}</span>
                    <span class="shrink-0 text-[12px] font-semibold text-ink-3">{{ x.status === 'ready' ? `${x.bank.total} preg.` : x.status === 'error' ? 'error' : 'procesando' }}</span>
                  </li>
                </ul>
                <p class="mt-5 max-w-[320px] text-[13px] font-medium leading-snug text-ink-2">
                  {{ many ? 'Cada archivo queda listo en ~1 minuto (de a 2 a la vez).' : 'En ~1 minuto ya puedes empezar a estudiar.' }}
                  Puedes cerrar esto: te aviso en Inicio cuando esté lista.
                </p>
              </template>
            </motion.div>

            <!-- ── Lista ── -->
            <motion.div
              v-else-if="step === 'ready' && source"
              key="ready"
              class="flex flex-col items-center py-2 text-center"
              :initial="{ opacity: 0, scale: 0.94 }"
              :animate="{ opacity: 1, scale: 1 }"
              :transition="spring.jelly"
            >
              <MascotBlob mood="celebrating" :size="150" />
              <template v-if="many">
                <p class="mt-3 font-display text-[28px] font-extrabold leading-none tracking-[-0.03em]">
                  {{ readySrcs.reduce((a, x) => a + x.bank.total, 0) }} preguntas listas
                </p>
                <p class="mt-2 text-[15px] font-semibold text-ink-2">de {{ readySrcs.length }} archivos</p>
                <ul class="mt-4 flex w-full flex-col gap-1.5 text-left">
                  <li v-for="x in srcs" :key="x.id" class="flex items-center gap-2 rounded-[16px] bg-surface px-3 py-2 ring-1 ring-line">
                    <PhCheckCircle v-if="x.status === 'ready'" :size="18" weight="fill" class="shrink-0 text-success" />
                    <PhX v-else :size="18" weight="bold" class="shrink-0 text-danger" />
                    <span class="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{{ x.title }}</span>
                    <button v-if="x.status === 'error'" class="shrink-0 text-[12.5px] font-bold text-lilac-deep underline" @click="retry(x.id)">Reintentar</button>
                    <span v-else class="shrink-0 text-[12px] font-semibold text-ink-3">{{ x.bank.total }} preg.</span>
                  </li>
                </ul>
              </template>
              <template v-else>
              <p class="mt-3 font-display text-[28px] font-extrabold leading-none tracking-[-0.03em]">{{ source.bank.total }} preguntas listas</p>
              <p class="mt-2 max-w-[340px] text-[15px] font-semibold text-ink-2">{{ source.title }}</p>
              <p v-if="deduplicated.has(source.id)" class="mt-3 rounded-full bg-mint-tint px-4 py-1.5 text-[13px] font-semibold">
                Ya tenías esta fuente, así que no hubo que esperar
              </p>
              <ul v-if="source.topics.length" class="mt-4 flex flex-wrap justify-center gap-1.5">
                <li
                  v-for="t in source.topics.slice(0, 6)"
                  :key="t"
                  class="rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-line"
                >
                  {{ t }}
                </li>
              </ul>
              </template>
              <p v-if="srcs.some((x) => x.filling)" class="mt-3 flex items-center gap-2 rounded-full bg-lilac-tint px-4 py-1.5 text-[13px] font-semibold">
                <span class="size-2 animate-pulse rounded-full bg-lilac" /> Ya puedes empezar; Mocca sigue haciendo más preguntas
              </p>
              <p v-if="uploadErrors.length" class="mt-3 rounded-[16px] bg-pink-tint px-3 py-2 text-[13px] font-semibold">
                No se subió: {{ uploadErrors.map((e) => e.name).join(', ') }}
              </p>
            </motion.div>

            <!-- ── Error ── -->
            <motion.div
              v-else-if="step === 'error'"
              key="error"
              class="flex flex-col items-center py-4 text-center"
              :initial="{ opacity: 0, y: 12 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="spring.card"
            >
              <MascotBlob mood="sad" :size="140" />
              <p class="mt-4 max-w-[340px] font-display text-[19px] font-bold leading-snug">
                {{ source?.errorMessage ?? formError ?? 'No pude generar las preguntas.' }}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <!-- ── Acciones ── -->
        <footer class="border-t border-line/70 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
          <BaseButton v-if="step === 'form'" variant="primary" size="xl" block :disabled="!canSubmit" :loading="busy" @click="submit">
            Generar preguntas
          </BaseButton>
          <BaseButton v-else-if="step === 'uploading'" variant="surface" size="lg" block @click="abort?.abort()">Cancelar</BaseButton>
          <BaseButton v-else-if="step === 'processing'" variant="surface" size="lg" block @click="close">Seguir en segundo plano</BaseButton>
          <div v-else-if="step === 'ready'" class="grid gap-2">
            <BaseButton variant="primary" size="xl" block @click="goConfigure">
              {{ readySrcs.length > 1 ? `Armar examen con las ${readySrcs.length}` : 'Armar examen' }} <PhArrowRight :size="20" weight="bold" />
            </BaseButton>
            <BaseButton variant="ghost" size="md" block @click="reset">Agregar otra fuente</BaseButton>
          </div>
          <div v-else class="grid gap-2">
            <BaseButton v-if="failedSrcs.length" size="xl" block :loading="busy" @click="retry()">
              <PhArrowsClockwise :size="20" weight="bold" /> Reintentar
            </BaseButton>
            <BaseButton variant="ghost" size="md" block @click="reset">Probar con otra fuente</BaseButton>
          </div>
        </footer>
      </motion.section>
    </div>
  </AnimatePresence>
</template>

<style scoped>
/* barra indeterminada: una píldora lila que va y viene */
.vq-indeterminate {
  position: relative;
}
.vq-indeterminate::after {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 40%;
  border-radius: 999px;
  background: var(--vq-lilac);
  animation: slide 1.6s var(--ease-out-soft) infinite;
}
@keyframes slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(260%); }
}
</style>
