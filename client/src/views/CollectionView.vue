<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PhArrowLeft, PhCards, PhExam, PhFolderSimpleMinus, PhPencilSimple, PhPlus, PhTrash } from '@phosphor-icons/vue'
import { SOURCE_COLORS, type SourceDTO } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import SourceFolder from '@/components/SourceFolder.vue'
import SourcePicker from '@/components/collections/SourcePicker.vue'
import { api, ApiRequestError } from '@/api/client'
import { colorClasses } from '@/lib/motion'
import { useCollectionsStore } from '@/stores/collections'
import { useSourcesStore } from '@/stores/sources'

/** Una carpeta grande: sus fuentes, y estudiar todo junto (examen o tarjetas). */
const route = useRoute()
const router = useRouter()
const collections = useCollectionsStore()
const sources = useSourcesStore()
const id = String(route.params.id)
const error = ref('')

onMounted(async () => {
  await Promise.all([sources.loaded ? null : sources.fetchAll(), collections.fetchAll()]).catch((e: Error) => (error.value = e.message))
})

const collection = computed(() => collections.byId.get(id))
const inside = computed(() => (collection.value?.sourceIds ?? []).map((s) => sources.byId.get(s)).filter((s): s is SourceDTO => !!s))
const readyIds = computed(() => inside.value.filter((s) => s.status === 'ready').map((s) => s.id))
const questions = computed(() => inside.value.reduce((a, s) => a + s.bank.total, 0))

function openSource(s: SourceDTO) {
  if (s.status === 'ready') router.push({ path: '/configurar', query: { source: s.id } })
  else if (s.status === 'error') api.retrySource(s.id).then(sources.upsert)
}

// ── agregar fuentes ──
const adding = ref(false)
const picked = ref<string[]>([])
const outside = computed(() => sources.list.filter((s) => !collection.value?.sourceIds.includes(s.id)))
async function add() {
  try {
    await collections.add(id, picked.value)
    picked.value = []
    adding.value = false
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No se pudieron agregar.'
  }
}

// ── editar / sacar / borrar ──
const editing = ref(false)
const name = ref('')
function startEdit() {
  name.value = collection.value?.name ?? ''
  editing.value = true
}
async function saveEdit() {
  if (!name.value.trim()) return
  await collections.update(id, { name: name.value.trim() }).catch(() => (error.value = 'No se pudo renombrar.'))
  editing.value = false
}
const takeOut = (s: SourceDTO) => collections.takeOut(id, s.id).catch(() => (error.value = 'No se pudo sacar.'))
async function removeCollection() {
  if (!confirm(`¿Borrar la carpeta «${collection.value?.name}»? Las fuentes NO se borran: quedan sueltas.`)) return
  await collections.remove(id)
  router.push('/fuentes')
}
</script>

<template>
  <main class="mx-auto max-w-[440px] px-4 pb-32 pt-5 sm:max-w-3xl">
    <header class="flex items-center gap-3">
      <button class="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Volver" @click="router.push('/fuentes')">
        <PhArrowLeft :size="20" weight="bold" />
      </button>
      <span class="flex-1" />
      <button v-if="collection" class="grid size-11 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Renombrar carpeta" @click="startEdit">
        <PhPencilSimple :size="19" weight="bold" />
      </button>
    </header>

    <p v-if="error" class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>

    <template v-if="collection">
      <section :class="['mt-5 rounded-card-lg p-6 text-on-color', colorClasses[collection.color].solid]">
        <p class="text-[13px] font-bold uppercase tracking-wide opacity-60">Carpeta</p>
        <h1 class="mt-1 font-display text-[30px] font-extrabold uppercase leading-[1.02] tracking-[-0.02em]">{{ collection.name }}</h1>
        <p class="mt-2 text-[14px] font-semibold opacity-70">
          {{ inside.length }} {{ inside.length === 1 ? 'fuente' : 'fuentes' }} · {{ questions }} preguntas
        </p>
        <div v-if="readyIds.length" class="mt-5 grid grid-cols-2 gap-2">
          <BaseButton size="md" @click="router.push({ path: '/configurar', query: { sources: readyIds.join(',') } })">
            <PhExam :size="18" weight="bold" /> Examen
          </BaseButton>
          <BaseButton size="md" variant="surface" @click="router.push({ path: '/estudiar', query: { sources: readyIds.join(',') } })">
            <PhCards :size="18" weight="bold" /> Tarjetas
          </BaseButton>
        </div>
      </section>

      <div class="mt-7 flex items-center justify-between">
        <h2 class="text-[22px] font-bold">Adentro</h2>
        <button class="flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[13.5px] font-bold ring-1 ring-line" @click="adding = true">
          <PhPlus :size="16" weight="bold" /> Agregar fuentes
        </button>
      </div>

      <div v-if="inside.length" class="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
        <div v-for="s in inside" :key="s.id" class="relative">
          <SourceFolder :source="s" @click="openSource(s)" />
          <button
            class="absolute right-1 top-1 z-10 grid size-9 place-items-center rounded-full bg-white/70 text-on-color shadow-soft"
            :aria-label="`Sacar ${s.title} de la carpeta`"
            @click.stop="takeOut(s)"
          >
            <PhFolderSimpleMinus :size="20" weight="bold" />
          </button>
        </div>
      </div>
      <button
        v-else
        class="mt-4 flex w-full flex-col items-center rounded-card border-[2.5px] border-dashed border-ink/15 px-6 py-8 text-center"
        @click="adding = true"
      >
        <MascotBlob mood="thinking" :size="96" />
        <span class="mt-3 font-display text-[18px] font-bold">Carpeta vacía</span>
        <span class="mt-1 text-[14px] font-medium text-ink-2">Toca para meter las fuentes que ya subiste.</span>
      </button>

      <button class="mx-auto mt-10 flex items-center gap-1.5 text-[14px] font-bold text-danger" @click="removeCollection">
        <PhTrash :size="16" weight="bold" /> Borrar carpeta (las fuentes no se borran)
      </button>
    </template>

    <div v-else-if="collections.loaded" class="mt-16 text-center">
      <MascotBlob class="mx-auto" mood="sad" :size="110" />
      <p class="mt-3 font-display text-[18px] font-bold">Esta carpeta ya no existe</p>
      <BaseButton class="mt-4" size="md" @click="router.push('/fuentes')">Ver mis fuentes</BaseButton>
    </div>

    <!-- agregar fuentes -->
    <BottomSheet :open="adding" title="Agregar a la carpeta" @close="adding = false">
      <SourcePicker v-model="picked" :sources="outside" :current-collection-id="id" />
      <div class="h-2" />
      <template #footer>
        <BaseButton size="xl" block :disabled="!picked.length" @click="add">Agregar {{ picked.length || '' }}</BaseButton>
      </template>
    </BottomSheet>

    <!-- renombrar / color -->
    <BottomSheet :open="editing" title="Editar carpeta" @close="editing = false">
      <input
        v-model="name"
        maxlength="60"
        class="h-12 w-full rounded-[16px] bg-surface px-4 font-display text-[17px] font-bold uppercase ring-1 ring-line focus:outline-none focus:ring-[2.5px] focus:ring-lilac"
        @keydown.enter="saveEdit"
      />
      <div v-if="collection" class="mt-3 flex gap-2 pb-2" role="radiogroup" aria-label="Color">
        <button
          v-for="c in SOURCE_COLORS"
          :key="c"
          role="radio"
          :aria-checked="collection.color === c"
          :aria-label="c"
          :class="['size-9 rounded-full', colorClasses[c].bg, collection.color === c ? 'scale-110 ring-[3px] ring-ink ring-offset-2 ring-offset-bg' : '']"
          @click="collections.update(id, { color: c })"
        />
      </div>
      <template #footer>
        <BaseButton size="xl" block :disabled="!name.trim()" @click="saveEdit">Guardar</BaseButton>
      </template>
    </BottomSheet>
  </main>
</template>
