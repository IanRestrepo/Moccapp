<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { motion } from 'motion-v'
import confetti from 'canvas-confetti'
import { PhArrowLeft, PhBook, PhCheck, PhCrown, PhLock, PhStar, PhTreasureChest } from '@phosphor-icons/vue'
import type { PathDTO, PathNodeDTO, SourceColor } from '@vetquiz/shared'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import { api, ApiRequestError } from '@/api/client'
import { useSound } from '@/composables/useSound'
import { useStatsStore } from '@/stores/stats'
import { colorClasses } from '@/lib/motion'

/** Camino tipo Duolingo: unidades (una por fuente) con nodos que se desbloquean en orden. */
const router = useRouter()
const stats = useStatsStore()
const { play } = useSound()
const path = ref<PathDTO | null>(null)
const error = ref('')
const toast = ref('')
const shaking = ref<string | null>(null)

// sombra "3D" de los nodos: el mismo color, más oscuro
const SHADE: Record<SourceColor, string> = {
  yellow: '#c98f0c',
  orange: '#c45a12',
  lilac: '#6a4bc4',
  pink: '#c23f83',
  mint: '#23874f',
  sky: '#3b72c9',
}
// zigzag como en Duolingo
const OFFSETS = [0, 56, 84, 56, 0, -56, -84, -56]

async function load() {
  try {
    path.value = await api.path()
    error.value = ''
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude cargar el camino.'
  }
}

// vuelve a la última unidad que estaba estudiando (si no, la primera sin terminar)
const LAST_UNIT = 'vq-path-unit'
const readLast = () => {
  try {
    return localStorage.getItem(LAST_UNIT)
  } catch {
    return null
  }
}
const lastUnit = ref(readLast())
const rememberUnit = (id: string) => {
  lastUnit.value = id
  try {
    localStorage.setItem(LAST_UNIT, id)
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}
const unitCurrentKey = (unitId: string) => path.value?.units.find((u) => u.sourceId === unitId)?.nodes.find((n) => n.status === 'current')?.key ?? null
const unitDone = (unitId: string) => {
  const u = path.value?.units.find((x) => x.sourceId === unitId)
  return u ? u.nodes.filter((n) => n.status === 'done').length : 0
}
/** Nodo donde se para Mocca: el de la última unidad que usó, o el actual general */
const focusKey = computed(() => {
  return (lastUnit.value && unitCurrentKey(lastUnit.value)) || path.value?.currentKey || null
})

function goToUnit(id: string) {
  rememberUnit(id)
  const key = unitCurrentKey(id)
  document.getElementById(key ? `nodo-${key}` : `unidad-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

onMounted(async () => {
  await load()
  await nextTick()
  if (focusKey.value) document.getElementById(`nodo-${focusKey.value}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
})

function say(text: string) {
  toast.value = text
  setTimeout(() => (toast.value = ''), 2600)
}

async function tap(n: PathNodeDTO) {
  if (n.status === 'locked') {
    play('wrong')
    shaking.value = n.key
    setTimeout(() => (shaking.value = null), 450)
    return say('Termina las lecciones anteriores de esta unidad para desbloquearla.')
  }
  if (n.kind === 'chest') {
    if (n.status === 'done') return say('Este cofre ya lo abriste.')
    try {
      const r = await api.openChest(n.key)
      play('perfect')
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, colors: ['#f2b31f', '#8d6ce6', '#ee5fa8', '#35b673'] })
      say(r.bones ? `¡Cofre abierto! +${r.bones} huesitos` : `¡Cofre abierto! +${r.xp} XP`)
      stats.refresh().catch(() => {})
      await load()
    } catch (err) {
      say(err instanceof ApiRequestError ? err.message : 'No se pudo abrir.')
    }
    return
  }
  play('tap')
  rememberUnit(n.key.split(':')[0]!)
  router.push(`/leccion/${n.key}`)
}

const icon = (n: PathNodeDTO) =>
  n.status === 'locked' ? PhLock : n.kind === 'chest' ? PhTreasureChest : n.kind === 'boss' ? PhCrown : n.status === 'done' ? PhCheck : n.key.endsWith(':0') ? PhStar : PhBook
</script>

<template>
  <main class="mx-auto max-w-[560px] px-4 pb-32 pt-5">
    <header class="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-bg/90 px-4 pb-3 pt-1 backdrop-blur">
      <button class="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Volver" @click="router.push('/')">
        <PhArrowLeft :size="20" weight="bold" />
      </button>
      <h1 class="flex-1 font-display text-[22px] font-extrabold">Tu camino</h1>
      <span v-if="path" class="rounded-full bg-surface px-3 py-1.5 text-[13px] font-bold ring-1 ring-line">{{ path.done }}/{{ path.total }}</span>
    </header>

    <!-- Saltar a cualquier carpeta: cada una se desbloquea por separado -->
    <nav v-if="path && path.units.length > 1" class="sticky top-[60px] z-20 -mx-4 flex gap-2 overflow-x-auto bg-bg/90 px-4 pb-3 backdrop-blur" aria-label="Unidades">
      <button
        v-for="(unit, u) in path.units"
        :key="unit.sourceId"
        :class="['flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-[13px] font-bold', colorClasses[unit.color].solid]"
        @click="goToUnit(unit.sourceId)"
      >
        <span class="grid size-6 place-items-center rounded-full bg-white/60 text-[12px] font-extrabold">{{ u + 1 }}</span>
        <span class="max-w-[140px] truncate">{{ unit.title }}</span>
        <span class="opacity-60">{{ unitDone(unit.sourceId) }}/{{ unit.nodes.length }}</span>
      </button>
    </nav>

    <p
      v-if="toast"
      role="status"
      class="fixed inset-x-4 top-4 z-50 mx-auto max-w-[420px] rounded-[18px] bg-night px-4 py-3 text-center text-[14px] font-bold text-white shadow-float"
    >
      {{ toast }}
    </p>

    <p v-if="error" class="mt-6 rounded-[18px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>

    <section v-else-if="path && !path.units.length" class="mt-10 text-center">
      <MascotBlob class="mx-auto" mood="thinking" :size="120" />
      <p class="mt-4 font-display text-[18px] font-bold">Todavía no hay camino</p>
      <p class="mt-1 text-[14px] text-ink-2">Sube una fuente y Mocca arma las lecciones solo.</p>
    </section>

    <template v-else-if="path">
      <section v-for="(unit, u) in path.units" :id="`unidad-${unit.sourceId}`" :key="unit.sourceId" class="mt-6 scroll-mt-32">
        <div :class="['rounded-card p-5', colorClasses[unit.color].solid]">
          <p class="text-[13px] font-bold uppercase tracking-wide opacity-70">Unidad {{ u + 1 }}</p>
          <h2 class="mt-0.5 font-display text-[20px] font-extrabold leading-tight">{{ unit.title }}</h2>
        </div>

        <ol class="relative mt-14 flex flex-col items-center gap-12">
          <li
            v-for="(n, i) in unit.nodes"
            :id="`nodo-${n.key}`"
            :key="n.key"
            class="relative flex flex-col items-center"
            :style="{ transform: `translateX(${OFFSETS[i % OFFSETS.length]}px)` }"
          >
            <!-- burbuja "Empezar" sobre el nodo actual -->
            <motion.span
              v-if="n.status === 'current'"
              class="absolute -top-11 z-10 whitespace-nowrap rounded-[12px] bg-surface px-3 py-1.5 text-[13px] font-extrabold uppercase tracking-wide ring-2 ring-line"
              :animate="{ y: [0, -5, 0] }"
              :transition="{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }"
            >
              {{ n.kind === 'chest' ? 'Ábrelo' : 'Empezar' }}
            </motion.span>

            <motion.button
              type="button"
              :aria-label="`${n.label}${n.status === 'locked' ? ' (bloqueada)' : ''}`"
              :class="[
                'relative grid place-items-center rounded-full transition-transform active:translate-y-1.5',
                n.kind === 'boss' ? 'size-[84px]' : 'size-[72px]',
                n.status === 'locked' ? 'bg-surface-2 text-ink-3' : colorClasses[unit.color].solid,
              ]"
              :style="{ boxShadow: `0 7px 0 ${n.status === 'locked' ? 'rgba(0,0,0,.25)' : SHADE[unit.color]}` }"
              :animate="shaking === n.key ? { x: [0, -8, 8, -4, 0] } : { x: 0 }"
              :transition="{ duration: 0.4 }"
              @click="tap(n)"
            >
              <span v-if="n.status === 'current'" class="absolute -inset-2.5 rounded-full ring-4 ring-current opacity-30" />
              <component :is="icon(n)" :size="n.kind === 'boss' ? 38 : 32" weight="fill" />
            </motion.button>

            <span v-if="n.kind !== 'chest'" class="mt-3 flex gap-0.5" :aria-label="`${n.stars} estrellas`">
              <PhStar v-for="s in 3" :key="s" :size="15" weight="fill" :class="s <= n.stars ? 'text-yellow' : 'text-ink-3/30'" />
            </span>
            <span class="mt-0.5 text-[12px] font-bold text-ink-2">{{ n.label }}</span>

            <!-- Mocca acompaña el nodo actual -->
            <MascotBlob
              v-if="n.key === focusKey"
              class="pointer-events-none absolute top-0"
              :class="OFFSETS[i % OFFSETS.length]! > 0 ? '-left-28' : '-right-28'"
              mood="happy"
              :size="88"
            />
          </li>
        </ol>
      </section>

      <section v-if="!path.currentKey" class="mt-12 text-center">
        <MascotBlob class="mx-auto" mood="proud" :size="130" />
        <p class="mt-3 font-display text-[20px] font-extrabold">¡Terminaste todo el camino!</p>
        <p class="mt-1 text-[14px] text-ink-2">Repite lecciones para conseguir 3 estrellas en todas.</p>
      </section>
    </template>

    <div v-else class="flex min-h-[50dvh] items-center justify-center"><MascotBlob mood="thinking" :size="100" /></div>
  </main>
</template>
