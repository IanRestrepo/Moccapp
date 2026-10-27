<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  PhArrowLeft,
  PhArrowsClockwise,
  PhBell,
  PhBookOpen,
  PhCards,
  PhChartBar,
  PhChatCircleText,
  PhCheck,
  PhClockCounterClockwise,
  PhDeviceMobile,
  PhDog,
  PhExam,
  PhEye,
  PhEyeSlash,
  PhFolders,
  PhGearSix,
  PhGift,
  PhHouse,
  PhLockKey,
  PhPath,
  PhPlus,
  PhSliders,
  PhTrash,
  PhX,
} from '@phosphor-icons/vue'
import { REWARD_STICKERS, type AdminPersonDTO, type AdminRewardsDTO, type PresenceView, type RewardDTO, type RewardSticker } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import StickerIcon from '@/components/StickerIcon.vue'
import AdminMessages from '@/components/admin/AdminMessages.vue'
import { api, ApiRequestError } from '@/api/client'
import { relativeDay } from '@/lib/format'
import { usePhone } from '@/composables/usePhone'
import { REWARD_STICKER_LABEL, REWARD_TINT, bonesText, costText, groupRedemptions } from '@/lib/rewards'

/**
 * Panel de Ian: cómo va Ash (en línea, racha, nivel, huesitos), mensajitos de Mocca,
 * premios por entregar y ajustes (regalar huesitos, editar premios). Protegido con ADMIN_CODE.
 */
const router = useRouter()
const state = ref<'loading' | 'login' | 'disabled' | 'ready'>('loading')
const data = ref<AdminRewardsDTO | null>(null)
const msg = ref<{ ok: boolean; text: string } | null>(null)
const code = ref('')

const say = (ok: boolean, text: string): void => {
  msg.value = { ok, text }
  setTimeout(() => (msg.value = null), 3500)
}
const fail = (err: unknown) => say(false, err instanceof ApiRequestError ? err.message : 'Algo salió mal.')

async function load() {
  const status = await api.adminStatus().catch(() => null)
  if (status?.disabled) return void (state.value = 'disabled')
  if (!status?.granted) return void (state.value = 'login')
  ;[data.value] = await Promise.all([api.adminRewards(), loadPresence()])
  drafts.clear()
  for (const r of data.value.rewards) drafts.set(r.id, { ...r })
  state.value = 'ready'
}
onMounted(load)

type Tab = 'mensajes' | 'premios' | 'ajustes'
const tab = ref<Tab>('mensajes')

// ── ¿Está usando la app? y sus números ───────────────────────
const people = ref<AdminPersonDTO[]>([])
const owner = computed(() => people.value[0])
const guests = computed(() => people.value.slice(1))
const viewLabel = (p: AdminPersonDTO) => VIEW_LABEL[p.view ?? 'other']
// el dispositivo se muestra siempre (en línea y en la última vez)
const statusText = (p: AdminPersonDTO) =>
  p.online
    ? `Ahora mismo${p.device ? ` · desde ${p.device}` : ''}`
    : `Última vez ${lastSeenText(p.lastSeenAt)}${p.device ? ` · desde ${p.device}` : ''}`
// la sección, bien grande: dónde está ahora (o dónde estuvo de último)
const VIEW_ICON: Record<PresenceView, unknown> = {
  home: PhHouse,
  sources: PhFolders,
  configure: PhSliders,
  study: PhCards,
  path: PhPath,
  lesson: PhBookOpen,
  exam: PhExam,
  results: PhChartBar,
  history: PhClockCounterClockwise,
  rewards: PhGift,
  mocca: PhDog,
  other: PhDeviceMobile,
}
const sectionIcon = (p: AdminPersonDTO) => VIEW_ICON[p.view ?? 'other']
const sectionText = (p: AdminPersonDTO) => {
  const label = viewLabel(p)
  return (p.online ? 'Está ' : 'Lo último: ') + label
}
const now = ref(Date.now())
const VIEW_LABEL: Record<PresenceView, string> = {
  home: 'en el Inicio',
  sources: 'viendo sus fuentes',
  configure: 'armando un examen',
  study: 'estudiando con tarjetas',
  path: 'mirando su camino',
  lesson: 'haciendo una lección',
  exam: 'haciendo un examen',
  results: 'viendo resultados',
  history: 'en el historial',
  rewards: 'mirando premios',
  mocca: 'jugando con Mocca',
  other: 'en la app',
}
const timeFmt = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })
function ago(iso: string): string {
  const min = Math.floor((now.value - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}
function lastSeenText(at: string | null) {
  if (!at) return ': todavía no ha abierto la app'
  return `${ago(at)} · ${relativeDay(at).toLowerCase()} a las ${timeFmt.format(new Date(at))}`
}
async function loadPresence() {
  now.value = Date.now()
  people.value = await api.adminOverview().catch(() => people.value)
}
let presenceTimer = 0
onMounted(() => (presenceTimer = window.setInterval(() => state.value === 'ready' && loadPresence(), 20_000)))
onBeforeUnmount(() => clearInterval(presenceTimer))

// ── Avisos al administrador (premios reclamados) ─────────────
const phone = usePhone()
const adminPush = ref<'idle' | 'busy' | 'ok'>('idle')
async function enableAdminPush() {
  adminPush.value = 'busy'
  try {
    const r = await phone.enablePush(true)
    if (r === 'ok') adminPush.value = 'ok'
    else {
      adminPush.value = 'idle'
      say(false, r === 'denied' ? 'Los avisos están bloqueados en este navegador.' : r === 'disabled' ? 'Faltan las llaves de avisos en el servidor.' : 'Este navegador no permite avisos (en iPhone, agrega la app al inicio).')
    }
  } catch {
    adminPush.value = 'idle'
    say(false, 'No se pudieron activar los avisos.')
  }
}

async function login() {
  try {
    await api.adminLogin(code.value)
    code.value = ''
    await load()
  } catch (err) {
    fail(err)
  }
}

const pending = computed(() => data.value?.redemptions.filter((r) => r.status === 'pending') ?? [])
const resolved = computed(() => data.value?.redemptions.filter((r) => r.status !== 'pending') ?? [])
// iguales agrupados: "Beso loco ×3" con botón para entregar uno o todos
const pendingGroups = computed(() => groupRedemptions(pending.value))
const resolvedGroups = computed(() => groupRedemptions(resolved.value).slice(0, 12))

async function resolveMany(ids: string[], status: 'delivered' | 'cancelled') {
  try {
    for (const id of ids) await api.resolveRedemption(id, status)
    say(true, status === 'delivered' ? `¡${ids.length} entregados!` : 'Cancelados: se le devolvieron los huesitos.')
    await load()
  } catch (err) {
    fail(err)
  }
}

async function resolve(id: string, status: 'delivered' | 'cancelled') {
  try {
    await api.resolveRedemption(id, status)
    say(true, status === 'delivered' ? '¡Marcado como entregado!' : 'Cancelado: se le devolvieron los huesitos.')
    await load()
  } catch (err) {
    fail(err)
  }
}

// ── Regalar huesitos ─────────────────────────────────────────
const gift = ref(50)
async function grant() {
  try {
    const res = await api.grantBones(gift.value)
    say(true, `Le regalaste ${bonesText(gift.value)} huesitos. Ahora tiene ${bonesText(res.balance)}.`)
    await load()
  } catch (err) {
    fail(err)
  }
}

// ── Editar premios ───────────────────────────────────────────
const drafts = reactive(new Map<string, RewardDTO>())
const changed = (r: RewardDTO) => {
  const d = drafts.get(r.id)
  return !!d && (d.name !== r.name || d.description !== r.description || d.cost !== r.cost || d.sticker !== r.sticker || d.active !== r.active)
}

async function save(r: RewardDTO) {
  const d = drafts.get(r.id)!
  try {
    await api.updateReward(r.id, { name: d.name, description: d.description, cost: Number(d.cost), sticker: d.sticker, active: d.active })
    say(true, 'Premio guardado.')
    await load()
  } catch (err) {
    fail(err)
  }
}

async function remove(r: RewardDTO) {
  if (!confirm(`¿Borrar "${r.name}"? Si ya lo reclamó alguna vez, solo se oculta.`)) return
  try {
    await api.deleteReward(r.id)
    await load()
  } catch (err) {
    fail(err)
  }
}

const fresh = reactive({ name: '', description: '', cost: 300, sticker: 'gift' as RewardSticker })
async function create() {
  try {
    await api.createReward({ ...fresh, cost: Number(fresh.cost) })
    Object.assign(fresh, { name: '', description: '', cost: 300, sticker: 'gift' })
    say(true, 'Premio creado.')
    await load()
  } catch (err) {
    fail(err)
  }
}

const input = 'h-11 min-w-0 rounded-[14px] bg-surface px-3 text-[14px] ring-1 ring-line focus:outline-none focus:ring-[2.5px] focus:ring-lilac'
</script>

<template>
  <main class="mx-auto max-w-[560px] px-4 pb-24 pt-5">
    <header class="flex items-center gap-3">
      <button class="grid size-11 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Volver" @click="router.push('/')">
        <PhArrowLeft :size="20" weight="bold" />
      </button>
      <span class="flex-1 font-display text-[18px] font-extrabold">Panel de Ian</span>
      <button v-if="state === 'ready'" class="grid size-11 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Actualizar" @click="load">
        <PhArrowsClockwise :size="19" weight="bold" />
      </button>
    </header>

    <p
      v-if="msg"
      role="status"
      :class="['fixed inset-x-4 top-4 z-[80] mx-auto max-w-[420px] rounded-[18px] px-4 py-3 text-center text-[14px] font-bold shadow-float', msg.ok ? 'bg-mint text-on-color' : 'bg-pink text-on-color']"
    >
      {{ msg.text }}
    </p>

    <!-- apagada / login -->
    <section v-if="state === 'disabled'" class="mt-8 rounded-card bg-surface p-6 text-center ring-1 ring-line">
      <MascotBlob class="mx-auto" mood="sad" :size="100" />
      <p class="mt-3 font-display text-[18px] font-bold">Esta página está apagada</p>
      <p class="mt-1 text-[14px] text-ink-2">Configura la variable <code>ADMIN_CODE</code> en el servidor para usarla.</p>
    </section>
    <form v-else-if="state === 'login'" class="mt-8 rounded-card bg-surface p-6 ring-1 ring-line" @submit.prevent="login">
      <p class="font-display text-[18px] font-bold">Código de administrador</p>
      <p class="mt-1 text-[14px] text-ink-2">Es distinto al código de acceso de la app. Solo tú lo sabes.</p>
      <label class="mt-4 flex h-12 items-center gap-2 rounded-full bg-bg px-4 ring-1 ring-line">
        <PhLockKey :size="18" weight="bold" class="text-ink-3" />
        <input v-model="code" type="password" class="h-full flex-1 bg-transparent focus:outline-none" aria-label="Código de administrador" />
      </label>
      <BaseButton class="mt-4" type="submit" size="lg" block :disabled="!code">Entrar</BaseButton>
    </form>

    <template v-else-if="state === 'ready' && data">
      <!-- Ash: estado y números -->
      <section v-if="owner" class="relative mt-4 overflow-hidden rounded-card-lg bg-night p-5 pr-32 text-white">
        <MascotBlob
          class="pointer-events-none absolute -bottom-2 right-0"
          :mood="owner.online ? (owner.view === 'exam' || owner.view === 'lesson' ? 'thinking' : 'celebrating') : owner.stats.studiedToday ? 'proud' : 'sad'"
          :size="130"
        />
        <p class="flex items-center gap-2 text-[13px] font-bold">
          <span class="relative flex size-2.5">
            <span v-if="owner.online" class="absolute inset-0 animate-ping rounded-full bg-mint" />
            <span :class="['relative size-2.5 rounded-full', owner.online ? 'bg-mint' : 'bg-white/30']" />
          </span>
          <span :class="owner.online ? 'text-mint' : 'text-white/60'">{{ owner.online ? 'En línea' : 'Desconectada' }}</span>
        </p>
        <h1 class="mt-1 font-display text-[34px] font-extrabold leading-none tracking-[-0.02em]">{{ owner.name.split(' ')[0] }}</h1>
        <p
          v-if="owner.view"
          :class="['mt-2.5 inline-flex max-w-full items-center gap-2 rounded-[14px] px-3 py-2 text-[15px] font-extrabold leading-tight', owner.online ? 'bg-mint text-on-color' : 'bg-white/10 text-white/85']"
          aria-label="Sección de la app"
        >
          <component :is="sectionIcon(owner)" :size="20" weight="bold" class="shrink-0" />
          {{ sectionText(owner) }}
        </p>
        <p class="mt-1.5 text-[13.5px] font-medium leading-snug text-white/70">{{ statusText(owner) }}</p>
        <p :class="['mt-3 inline-flex rounded-full px-3 py-1 text-[12.5px] font-bold', owner.stats.studiedToday ? 'bg-mint text-on-color' : 'bg-white/10 text-white/80']">
          {{ owner.stats.studiedToday ? '✓ Hoy ya estudió' : 'Hoy todavía no estudia' }}
        </p>
      </section>
      <div v-if="owner" class="mt-2 grid grid-cols-4 gap-2">
        <div class="rounded-[18px] bg-orange p-3 text-on-color">
          <p class="font-display text-[22px] font-extrabold leading-none">{{ owner.stats.streak }}</p>
          <p class="mt-1 text-[11.5px] font-bold opacity-70">racha 🔥</p>
        </div>
        <div class="rounded-[18px] bg-yellow p-3 text-on-color">
          <p class="font-display text-[22px] font-extrabold leading-none">{{ bonesText(owner.stats.bones ?? data.balance) }}</p>
          <p class="mt-1 text-[11.5px] font-bold opacity-70">huesitos</p>
        </div>
        <div class="rounded-[18px] bg-sky p-3 text-on-color">
          <p class="font-display text-[22px] font-extrabold leading-none">{{ owner.stats.level }}</p>
          <p class="mt-1 text-[11.5px] font-bold opacity-70">nivel</p>
        </div>
        <div class="rounded-[18px] bg-mint p-3 text-on-color">
          <p class="font-display text-[22px] font-extrabold leading-none">{{ owner.stats.examsCompleted }}</p>
          <p class="mt-1 text-[11.5px] font-bold opacity-70">exámenes</p>
        </div>
      </div>
      <!-- invitadas, en una línea -->
      <!-- invitadas: tarjeta completa, más pequeña que la de Ash -->
      <section v-for="g in guests" :key="g.profile" class="mt-3 rounded-[22px] bg-surface p-4 ring-1 ring-line">
        <div class="flex items-center gap-3">
          <span class="relative flex size-2.5 shrink-0">
            <span v-if="g.online" class="absolute inset-0 animate-ping rounded-full bg-mint" />
            <span :class="['relative size-2.5 rounded-full', g.online ? 'bg-mint' : 'bg-ink-3/40']" />
          </span>
          <span class="font-display text-[18px] font-extrabold">{{ g.name }}</span>
          <span :class="['text-[12.5px] font-bold', g.online ? 'text-success' : 'text-ink-3']">{{ g.online ? 'En línea' : 'Desconectada' }}</span>
          <span class="flex-1" />
          <span :class="['rounded-full px-2.5 py-0.5 text-[11.5px] font-bold', g.stats.studiedToday ? 'bg-mint-tint text-success' : 'bg-surface-2 text-ink-2']">
            {{ g.stats.studiedToday ? '✓ Hoy estudió' : 'Hoy no ha estudiado' }}
          </span>
        </div>
        <p
          v-if="g.view"
          :class="['mt-2 inline-flex max-w-full items-center gap-1.5 rounded-[12px] px-2.5 py-1.5 text-[14px] font-bold leading-tight', g.online ? 'bg-mint-tint text-success' : 'bg-surface-2']"
          aria-label="Sección de la app"
        >
          <component :is="sectionIcon(g)" :size="17" weight="bold" class="shrink-0" />
          {{ sectionText(g) }}
        </p>
        <p class="mt-1.5 text-[13.5px] leading-snug text-ink-2">{{ statusText(g) }}</p>
        <div class="mt-3 grid grid-cols-4 gap-1.5 text-center">
          <div class="rounded-[14px] bg-surface-2 py-2">
            <p class="font-display text-[17px] font-extrabold leading-none">{{ g.stats.streak }}</p>
            <p class="mt-0.5 text-[11px] font-bold text-ink-2">racha 🔥</p>
          </div>
          <div class="rounded-[14px] bg-surface-2 py-2">
            <p class="font-display text-[17px] font-extrabold leading-none">{{ g.stats.level }}</p>
            <p class="mt-0.5 text-[11px] font-bold text-ink-2">nivel</p>
          </div>
          <div class="rounded-[14px] bg-surface-2 py-2">
            <p class="font-display text-[17px] font-extrabold leading-none">{{ g.stats.xp }}</p>
            <p class="mt-0.5 text-[11px] font-bold text-ink-2">XP</p>
          </div>
          <div class="rounded-[14px] bg-surface-2 py-2">
            <p class="font-display text-[17px] font-extrabold leading-none">{{ g.stats.examsCompleted }}</p>
            <p class="mt-0.5 text-[11px] font-bold text-ink-2">exámenes</p>
          </div>
        </div>
      </section>

      <!-- pestañas -->
      <nav class="sticky top-2 z-30 mt-6 grid grid-cols-3 gap-1 rounded-full bg-surface p-1 shadow-soft ring-1 ring-line" aria-label="Secciones">
        <button
          v-for="t in ([
            { id: 'mensajes', label: 'Mensajitos', icon: PhChatCircleText },
            { id: 'premios', label: 'Premios', icon: PhGift },
            { id: 'ajustes', label: 'Ajustes', icon: PhGearSix },
          ] as const)"
          :key="t.id"
          :class="['relative flex h-11 items-center justify-center gap-1.5 rounded-full text-[13.5px] font-bold transition-colors', tab === t.id ? 'bg-night text-white' : 'text-ink-2']"
          @click="tab = t.id"
        >
          <component :is="t.icon" :size="17" :weight="tab === t.id ? 'fill' : 'bold'" />
          {{ t.label }}
          <span v-if="t.id === 'premios' && pending.length" class="grid h-5 min-w-5 place-items-center rounded-full bg-pink px-1 text-[11px] font-extrabold text-on-color">
            {{ pending.length }}
          </span>
        </button>
      </nav>

      <!-- MENSAJITOS -->
      <div v-if="tab === 'mensajes'" class="mt-5">
        <AdminMessages :people="people" :view-label="viewLabel" @toast="say" />
      </div>

      <!-- PREMIOS -->
      <div v-else-if="tab === 'premios'" class="mt-5">
        <h2 class="text-[22px] font-bold">Por entregar</h2>
        <div v-if="!pending.length" class="mt-3 flex items-center gap-3 rounded-[20px] bg-surface p-4 ring-1 ring-line">
          <MascotBlob mood="happy" :size="56" />
          <p class="text-[14px] font-medium text-ink-2">Nada pendiente. Cuando reclame algo te sale aquí (y por WhatsApp).</p>
        </div>
        <ul class="mt-3 flex flex-col gap-2">
          <li v-for="g in pendingGroups" :key="g.key" class="rounded-[20px] bg-surface p-3 ring-1 ring-line">
            <div class="flex items-center gap-3">
              <span :class="['relative grid size-11 shrink-0 place-items-center rounded-[14px]', REWARD_TINT[g.first.sticker]]">
                <StickerIcon :name="g.first.sticker" :size="30" />
                <span v-if="g.count > 1" class="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-night px-1.5 text-[12px] font-extrabold text-white">
                  ×{{ g.count }}
                </span>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-display text-[16px] font-bold">{{ g.first.rewardName }}</span>
                <span class="text-[12.5px] text-ink-2">{{ g.count > 1 ? 'El último: ' : '' }}{{ relativeDay(g.first.createdAt) }} · {{ costText(g.first.cost) }}</span>
              </span>
              <!-- entrega/cancela el más antiguo de ese premio -->
              <button class="grid size-10 place-items-center rounded-full bg-mint text-on-color" aria-label="Marcar uno entregado" @click="resolve(g.items.at(-1)!.id, 'delivered')">
                <PhCheck :size="18" weight="bold" />
              </button>
              <button class="grid size-10 place-items-center rounded-full bg-surface-2" aria-label="Cancelar uno y devolver huesitos" @click="resolve(g.items.at(-1)!.id, 'cancelled')">
                <PhX :size="18" weight="bold" />
              </button>
            </div>
            <button
              v-if="g.count > 1"
              class="mt-2 w-full rounded-[14px] bg-mint-tint py-2 text-[13.5px] font-bold"
              @click="resolveMany(g.items.map((i) => i.id), 'delivered')"
            >
              Entregar los {{ g.count }}
            </button>
          </li>
        </ul>

        <template v-if="resolved.length">
          <h2 class="mt-8 text-[22px] font-bold">Historial</h2>
          <ul class="mt-3 flex flex-col gap-1.5">
            <li v-for="g in resolvedGroups" :key="g.key" class="flex items-center justify-between gap-3 rounded-[16px] bg-surface px-4 py-2.5 text-[14px] ring-1 ring-line">
              <span class="truncate font-semibold">{{ g.first.rewardName }}<b v-if="g.count > 1" class="ml-1.5">×{{ g.count }}</b></span>
              <span :class="['shrink-0 text-[12.5px] font-bold', g.first.status === 'delivered' ? 'text-success' : 'text-ink-3']">
                {{ g.first.status === 'delivered' ? 'Entregado' : 'Cancelado' }} · {{ relativeDay(g.first.resolvedAt ?? g.first.createdAt) }}
              </span>
            </li>
          </ul>
        </template>
      </div>

      <!-- AJUSTES -->
      <div v-else class="mt-5">
        <p v-if="!data.whatsappConfigured" class="mb-4 rounded-[18px] bg-yellow-tint px-4 py-3 text-[13.5px] font-semibold">
          Configura <code>ADMIN_WHATSAPP</code> (tu número con indicativo, ej. 573001234567) para que al reclamar le salga el botón de avisarte por WhatsApp.
        </p>

        <!-- avisos al administrador -->
        <button
          :disabled="adminPush !== 'idle'"
          :class="['flex w-full items-center gap-3 rounded-[20px] p-4 text-left ring-1 ring-line', adminPush === 'ok' ? 'bg-mint-tint' : 'bg-surface']"
          @click="enableAdminPush"
        >
          <PhBell :size="22" weight="bold" class="shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="block font-display text-[16px] font-bold">{{ adminPush === 'ok' ? 'Avisos activados en este dispositivo' : 'Avisarme cuando reclame un premio' }}</span>
            <span class="block text-[13px] text-ink-2">Notificación en este celular o computador, además del WhatsApp.</span>
          </span>
        </button>

        <!-- regalar -->
        <h2 class="mt-8 text-[22px] font-bold">Regalar huesitos</h2>
        <p class="mt-1 text-[13.5px] text-ink-2">Tiene {{ bonesText(data.balance) }} · ha ganado {{ bonesText(data.earnedTotal) }} en total</p>
        <div class="mt-3 flex flex-wrap items-center gap-2 rounded-[20px] bg-surface p-3 ring-1 ring-line">
          <button v-for="n in [20, 50, 100, 500]" :key="n" class="h-10 rounded-full bg-surface-2 px-4 text-[14px] font-bold" @click="gift = n">+{{ n }}</button>
          <input v-model.number="gift" type="number" min="1" :class="[input, 'w-24 shrink-0']" aria-label="Cantidad" />
          <BaseButton size="md" :disabled="!gift || gift < 1" @click="grant">Regalar</BaseButton>
        </div>

        <!-- premios -->
        <h2 class="mt-8 text-[22px] font-bold">Premios</h2>
        <ul class="mt-3 flex flex-col gap-3">
          <li v-for="r in data.rewards" :key="r.id" :class="['rounded-[22px] p-3 ring-1 ring-line', r.active ? 'bg-surface' : 'bg-surface-2 opacity-70']">
            <template v-if="drafts.get(r.id)">
              <div class="flex items-center gap-2">
                <span :class="['grid size-12 shrink-0 place-items-center rounded-[14px]', REWARD_TINT[drafts.get(r.id)!.sticker]]">
                  <StickerIcon :name="drafts.get(r.id)!.sticker" :size="34" />
                </span>
                <input v-model="drafts.get(r.id)!.name" :class="[input, 'flex-1']" aria-label="Nombre" />
                <input v-model.number="drafts.get(r.id)!.cost" type="number" min="0" :class="[input, 'w-24 shrink-0']" aria-label="Costo en huesitos (0 = gratis)" />
              </div>
              <input v-model="drafts.get(r.id)!.description" :class="[input, 'mt-2 w-full']" placeholder="Descripción" aria-label="Descripción" />
              <div class="mt-2 flex items-center gap-2">
                <select v-model="drafts.get(r.id)!.sticker" :class="[input, 'w-28 shrink-0']" aria-label="Dibujo">
                  <option v-for="s in REWARD_STICKERS" :key="s" :value="s">{{ REWARD_STICKER_LABEL[s] }}</option>
                </select>
                <button
                  class="flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] bg-surface-2 px-3 text-[13px] font-bold"
                  :aria-label="drafts.get(r.id)!.active ? 'Visible: tocar para ocultar' : 'Oculto: tocar para mostrar'"
                  @click="drafts.get(r.id)!.active = !drafts.get(r.id)!.active"
                >
                  <component :is="drafts.get(r.id)!.active ? PhEye : PhEyeSlash" :size="16" weight="bold" />
                  <span class="hidden sm:inline">{{ drafts.get(r.id)!.active ? 'Visible' : 'Oculto' }}</span>
                </button>
                <span class="flex-1" />
                <button class="grid size-11 place-items-center rounded-[14px] text-danger" :aria-label="`Borrar ${r.name}`" @click="remove(r)">
                  <PhTrash :size="18" weight="bold" />
                </button>
                <BaseButton size="md" :disabled="!changed(r)" @click="save(r)">Guardar</BaseButton>
              </div>
            </template>
          </li>
        </ul>

        <!-- nuevo -->
        <h2 class="mt-8 text-[22px] font-bold">Nuevo premio</h2>
        <form class="mt-3 rounded-[22px] bg-surface p-3 ring-1 ring-line" @submit.prevent="create">
          <div class="flex items-center gap-2">
            <span :class="['grid size-12 shrink-0 place-items-center rounded-[14px]', REWARD_TINT[fresh.sticker]]"><StickerIcon :name="fresh.sticker" :size="34" /></span>
            <input v-model="fresh.name" :class="[input, 'flex-1']" placeholder="Ej: Peluche de perrito" aria-label="Nombre del premio nuevo" />
            <input v-model.number="fresh.cost" type="number" min="0" :class="[input, 'w-24 shrink-0']" aria-label="Costo (0 = gratis)" />
          </div>
          <input v-model="fresh.description" :class="[input, 'mt-2 w-full']" placeholder="Descripción (opcional)" aria-label="Descripción del premio nuevo" />
          <div class="mt-2 flex items-center gap-2">
            <select v-model="fresh.sticker" :class="[input, 'w-28 shrink-0']" aria-label="Dibujo del premio nuevo">
              <option v-for="s in REWARD_STICKERS" :key="s" :value="s">{{ REWARD_STICKER_LABEL[s] }}</option>
            </select>
            <span class="flex-1" />
            <BaseButton type="submit" size="md" :disabled="!fresh.name.trim() || typeof fresh.cost !== 'number' || fresh.cost < 0"><PhPlus :size="16" weight="bold" /> Crear</BaseButton>
          </div>
        </form>
      </div>
    </template>

    <div v-else class="flex min-h-[40dvh] items-center justify-center"><MascotBlob mood="thinking" :size="100" /></div>
  </main>
</template>
