<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { PhArrowLeft, PhCheck, PhEye, PhEyeSlash, PhLockKey, PhPlus, PhTrash, PhX } from '@phosphor-icons/vue'
import { REWARD_STICKERS, type AdminRewardsDTO, type RewardDTO, type RewardSticker } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import StickerIcon from '@/components/StickerIcon.vue'
import { api, ApiRequestError } from '@/api/client'
import { relativeDay } from '@/lib/format'
import { REWARD_STICKER_LABEL, REWARD_TINT, bonesText } from '@/lib/rewards'

/** Página del administrador: entregar premios, editarlos y regalar huesitos. Protegida con ADMIN_CODE. */
const router = useRouter()
const state = ref<'loading' | 'login' | 'disabled' | 'ready'>('loading')
const data = ref<AdminRewardsDTO | null>(null)
const msg = ref<{ ok: boolean; text: string } | null>(null)
const code = ref('')

const say = (ok: boolean, text: string) => {
  msg.value = { ok, text }
  setTimeout(() => (msg.value = null), 3500)
}
const fail = (err: unknown) => say(false, err instanceof ApiRequestError ? err.message : 'Algo salió mal.')

async function load() {
  const status = await api.adminStatus().catch(() => null)
  if (status?.disabled) return void (state.value = 'disabled')
  if (!status?.granted) return void (state.value = 'login')
  data.value = await api.adminRewards()
  drafts.clear()
  for (const r of data.value.rewards) drafts.set(r.id, { ...r })
  state.value = 'ready'
}
onMounted(load)

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
const resolved = computed(() => data.value?.redemptions.filter((r) => r.status !== 'pending').slice(0, 20) ?? [])

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
      <span class="rounded-full bg-night px-3 py-1.5 text-[12px] font-bold text-white">Administrador</span>
    </header>
    <h1 class="mt-5 text-title font-extrabold">Premios de {{ data?.ownerName ?? 'Ashley' }}</h1>

    <p
      v-if="msg"
      role="status"
      :class="['fixed inset-x-4 top-4 z-50 mx-auto max-w-[420px] rounded-[18px] px-4 py-3 text-center text-[14px] font-bold shadow-float', msg.ok ? 'bg-mint text-on-color' : 'bg-pink text-on-color']"
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
      <p class="mt-2 text-[14px] font-medium text-ink-2">
        Saldo: <b class="text-ink">{{ bonesText(data.balance) }}</b> huesitos · ganados en total {{ bonesText(data.earnedTotal) }}
      </p>
      <p v-if="!data.whatsappConfigured" class="mt-3 rounded-[18px] bg-yellow-tint px-4 py-3 text-[13.5px] font-semibold">
        Configura <code>ADMIN_WHATSAPP</code> (tu número con indicativo, ej. 573001234567) para que al reclamar le salga el botón de avisarte por WhatsApp.
      </p>

      <!-- por entregar -->
      <h2 class="mt-8 text-[22px] font-bold">Por entregar ({{ pending.length }})</h2>
      <p v-if="!pending.length" class="mt-2 text-[14px] text-ink-2">Nada pendiente por ahora.</p>
      <ul class="mt-3 flex flex-col gap-2">
        <li v-for="p in pending" :key="p.id" class="flex items-center gap-3 rounded-[20px] bg-surface p-3 ring-1 ring-line">
          <span :class="['grid size-11 shrink-0 place-items-center rounded-[14px]', REWARD_TINT[p.sticker]]"><StickerIcon :name="p.sticker" :size="30" /></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-display text-[16px] font-bold">{{ p.rewardName }}</span>
            <span class="text-[12.5px] text-ink-2">{{ relativeDay(p.createdAt) }} · {{ bonesText(p.cost) }} huesitos</span>
          </span>
          <button class="grid size-10 place-items-center rounded-full bg-mint text-on-color" aria-label="Marcar entregado" @click="resolve(p.id, 'delivered')">
            <PhCheck :size="18" weight="bold" />
          </button>
          <button class="grid size-10 place-items-center rounded-full bg-surface-2" aria-label="Cancelar y devolver huesitos" @click="resolve(p.id, 'cancelled')">
            <PhX :size="18" weight="bold" />
          </button>
        </li>
      </ul>

      <!-- regalar -->
      <h2 class="mt-8 text-[22px] font-bold">Regalar huesitos</h2>
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
              <input v-model.number="drafts.get(r.id)!.cost" type="number" min="1" :class="[input, 'w-24 shrink-0']" aria-label="Costo en huesitos" />
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
          <input v-model.number="fresh.cost" type="number" min="1" :class="[input, 'w-24 shrink-0']" aria-label="Costo" />
        </div>
        <input v-model="fresh.description" :class="[input, 'mt-2 w-full']" placeholder="Descripción (opcional)" aria-label="Descripción del premio nuevo" />
        <div class="mt-2 flex items-center gap-2">
          <select v-model="fresh.sticker" :class="[input, 'w-28 shrink-0']" aria-label="Dibujo del premio nuevo">
            <option v-for="s in REWARD_STICKERS" :key="s" :value="s">{{ REWARD_STICKER_LABEL[s] }}</option>
          </select>
          <span class="flex-1" />
          <BaseButton type="submit" size="md" :disabled="!fresh.name.trim() || !fresh.cost"><PhPlus :size="16" weight="bold" /> Crear</BaseButton>
        </div>
      </form>

      <!-- historial -->
      <template v-if="resolved.length">
        <h2 class="mt-8 text-[22px] font-bold">Historial</h2>
        <ul class="mt-3 flex flex-col gap-1.5">
          <li v-for="h in resolved" :key="h.id" class="flex items-center justify-between rounded-[16px] bg-surface px-4 py-2.5 text-[14px] ring-1 ring-line">
            <span class="truncate font-semibold">{{ h.rewardName }}</span>
            <span :class="['shrink-0 text-[12.5px] font-bold', h.status === 'delivered' ? 'text-success' : 'text-ink-3']">
              {{ h.status === 'delivered' ? 'Entregado' : 'Cancelado' }} · {{ relativeDay(h.resolvedAt ?? h.createdAt) }}
            </span>
          </li>
        </ul>
      </template>
    </template>

    <div v-else class="flex min-h-[40dvh] items-center justify-center"><MascotBlob mood="thinking" :size="100" /></div>
  </main>
</template>
