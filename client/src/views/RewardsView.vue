<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import confetti from 'canvas-confetti'
import { PhCheckCircle, PhClock, PhWhatsappLogo, PhXCircle } from '@phosphor-icons/vue'
import { BONE_RULES, type RedeemResponse, type RewardDTO, type RewardsDTO } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import StickerIcon from '@/components/StickerIcon.vue'
import { api, ApiRequestError } from '@/api/client'
import { relativeDay } from '@/lib/format'
import { pressable, spring } from '@/lib/motion'
import { REWARD_TINT, bonesText } from '@/lib/rewards'
import { useSound } from '@/composables/useSound'

/** Premios de Ashley: se canjean con huesitos que gana estudiando. */
const data = ref<RewardsDTO | null>(null)
const error = ref<string | null>(null)
const sound = useSound()

async function load() {
  try {
    data.value = await api.rewards()
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude cargar los premios.'
  }
}
onMounted(load)

const balance = computed(() => data.value?.balance ?? 0)
/** Próxima meta: el premio más barato que todavía no le alcanza */
const nextGoal = computed(() => data.value?.rewards.find((r) => r.cost > balance.value))
const pending = computed(() => data.value?.redemptions.filter((r) => r.status === 'pending') ?? [])

const howToEarn = [
  { n: `+${BONE_RULES.finish}`, text: 'por terminar un examen' },
  { n: `+${BONE_RULES.perCorrect}`, text: 'por cada respuesta correcta' },
  { n: `+${BONE_RULES.goodScore}`, text: 'si sacas 4,0 o más' },
  { n: `+${BONE_RULES.perfect}`, text: 'por examen perfecto' },
  { n: `+${BONE_RULES.streakPerDay}×`, text: 'tu racha en el primer examen del día' },
]

// ── Reclamar ─────────────────────────────────────────────────
const confirming = ref<RewardDTO | null>(null)
const busy = ref(false)
const claimed = ref<{ reward: RewardDTO; res: RedeemResponse } | null>(null)

async function claim() {
  const reward = confirming.value
  if (!reward || busy.value) return
  busy.value = true
  confirming.value = null
  try {
    const res = await api.redeem(reward.id)
    claimed.value = { reward, res }
    sound.play('perfect')
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      setTimeout(
        () => confetti({ particleCount: 140, spread: 100, origin: { y: 0.55 }, colors: ['#ffcf3f', '#ff86c3', '#ab90f7', '#59d394', '#7fb4ff'], shapes: ['star', 'circle'] }),
        450,
      )
    await load()
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No se pudo reclamar. Intenta de nuevo.'
  } finally {
    busy.value = false
  }
}

const STATUS = {
  pending: { label: 'Por entregar', cls: 'bg-yellow-tint', icon: PhClock },
  delivered: { label: 'Entregado', cls: 'bg-mint-tint', icon: PhCheckCircle },
  cancelled: { label: 'Cancelado', cls: 'bg-surface-2 text-ink-2', icon: PhXCircle },
} as const
</script>

<template>
  <main class="mx-auto max-w-[440px] px-4 pb-32 pt-5">
    <p class="text-[15px] font-semibold text-ink-2">Los premios de {{ data?.ownerName ?? 'Ashley' }}</p>
    <h1 class="mt-1 text-mega font-extrabold">Premios</h1>

    <p v-if="error" role="alert" class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>

    <template v-if="data">
      <!-- saldo -->
      <section class="relative mt-6 rounded-card-lg bg-yellow p-6 pr-32 text-on-color">
        <p class="text-[14px] font-bold opacity-70">Tienes</p>
        <p class="mt-1 flex items-center gap-2 font-display-tight text-[56px] font-extrabold leading-none tabular-nums">
          {{ bonesText(balance) }}
          <StickerIcon name="bone" :size="40" :tilt="-18" />
        </p>
        <p class="mt-1 text-[15px] font-bold">huesitos para canjear</p>
        <p class="mt-3 text-[13px] font-semibold opacity-70">Has ganado {{ bonesText(data.earnedTotal) }} en total</p>
        <MascotBlob class="pointer-events-none absolute -top-8 right-0" mood="happy" :size="126" />
      </section>

      <!-- próxima meta -->
      <div v-if="nextGoal" class="mt-3 flex items-center gap-3 rounded-[22px] bg-surface p-3.5 ring-1 ring-line">
        <span :class="['grid size-12 shrink-0 place-items-center rounded-[16px]', REWARD_TINT[nextGoal.sticker]]">
          <StickerIcon :name="nextGoal.sticker" :size="34" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-[14px] font-semibold text-ink-2">
            Te faltan <span class="font-bold text-ink">{{ bonesText(nextGoal.cost - balance) }}</span> para {{ nextGoal.name }}
          </p>
          <div class="mt-2 h-2.5 overflow-hidden rounded-full bg-ink/10">
            <motion.div
              class="h-full rounded-full bg-yellow"
              :initial="{ width: '0%' }"
              :animate="{ width: `${Math.min(100, (balance / nextGoal.cost) * 100)}%` }"
              :transition="spring.fill"
            />
          </div>
        </div>
      </div>

      <!-- cómo se ganan -->
      <h2 class="mt-8 text-[22px] font-bold">Cómo ganar huesitos</h2>
      <ul class="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <li v-for="r in howToEarn" :key="r.text" class="flex w-[132px] shrink-0 flex-col rounded-[20px] bg-surface p-3 ring-1 ring-line">
          <span class="font-display text-[22px] font-extrabold">{{ r.n }}</span>
          <span class="mt-0.5 text-[12.5px] font-semibold leading-snug text-ink-2">{{ r.text }}</span>
        </li>
      </ul>

      <!-- premios -->
      <h2 class="mt-8 text-title font-extrabold">Canjea</h2>
      <ul class="mt-4 flex flex-col gap-3">
        <motion.li
          v-for="(r, i) in data.rewards"
          :key="r.id"
          :initial="{ opacity: 0, y: 16 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ ...spring.card, delay: i * 0.04 }"
          :class="['rounded-card p-4', REWARD_TINT[r.sticker], i === data.rewards.length - 1 && 'ring-[3px] ring-night ring-inset']"
        >
          <div class="flex items-center gap-4">
            <span class="grid size-[68px] shrink-0 place-items-center rounded-[20px] bg-surface">
              <StickerIcon :name="r.sticker" :size="48" />
            </span>
            <div class="min-w-0 flex-1">
              <p v-if="i === data.rewards.length - 1" class="text-[11.5px] font-extrabold tracking-[0.05em] text-ink-2">EL GRAN PREMIO</p>
              <p class="font-display text-[19px] font-bold leading-tight">{{ r.name }}</p>
              <p class="mt-0.5 text-[13px] font-medium leading-snug text-ink-2">{{ r.description }}</p>
            </div>
          </div>
          <div class="mt-3 flex items-center justify-between gap-3">
            <span class="flex items-center gap-1.5 font-display text-[18px] font-extrabold tabular-nums">
              <StickerIcon name="bone" :size="22" :tilt="-18" /> {{ bonesText(r.cost) }}
            </span>
            <motion.button
              v-if="balance >= r.cost"
              type="button"
              v-bind="pressable"
              class="h-11 rounded-full bg-night px-5 font-display text-[15px] font-bold text-white"
              @click="confirming = r"
            >
              Reclamar
            </motion.button>
            <span v-else class="text-[13px] font-semibold text-ink-2">Te faltan {{ bonesText(r.cost - balance) }}</span>
          </div>
        </motion.li>
      </ul>

      <!-- historial -->
      <template v-if="data.redemptions.length">
        <h2 class="mt-10 text-title font-extrabold">Tus premios</h2>
        <p v-if="pending.length" class="mt-1 text-[14px] font-medium text-ink-2">
          {{ pending.length === 1 ? 'Tienes 1 premio por recibir' : `Tienes ${pending.length} premios por recibir` }}
        </p>
        <ul class="mt-4 flex flex-col gap-2">
          <li v-for="h in data.redemptions" :key="h.id" class="flex items-center gap-3 rounded-[20px] bg-surface p-3 ring-1 ring-line">
            <span :class="['grid size-11 shrink-0 place-items-center rounded-[14px]', REWARD_TINT[h.sticker]]">
              <StickerIcon :name="h.sticker" :size="30" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-display text-[16px] font-bold">{{ h.rewardName }}</span>
              <span class="text-[12.5px] font-medium text-ink-2">{{ relativeDay(h.createdAt) }} · {{ bonesText(h.cost) }} huesitos</span>
            </span>
            <span :class="['flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold', STATUS[h.status].cls]">
              <component :is="STATUS[h.status].icon" :size="14" weight="bold" /> {{ STATUS[h.status].label }}
            </span>
          </li>
        </ul>
      </template>
    </template>

    <div v-else-if="!error" class="flex min-h-[50dvh] items-center justify-center"><MascotBlob mood="thinking" :size="110" /></div>

    <ConfirmDialog
      :open="!!confirming"
      :title="`¿Reclamar ${confirming?.name ?? ''}?`"
      :body="confirming ? `Se descuentan ${bonesText(confirming.cost)} huesitos. Te quedan ${bonesText(balance - confirming.cost)}.` : ''"
      confirm="¡Sí, lo quiero!"
      cancel="Todavía no"
      mood="happy"
      primary
      @confirm="claim"
      @cancel="confirming = null"
    />

    <!-- premio reclamado -->
    <AnimatePresence>
      <div v-if="claimed" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
        <motion.div class="absolute inset-0 bg-[#16141c]/55" :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :exit="{ opacity: 0 }" @click="claimed = null" />
        <motion.div
          role="dialog"
          aria-modal="true"
          class="relative w-full rounded-t-[34px] bg-bg px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-7 text-center sm:max-w-[420px] sm:rounded-[34px]"
          :initial="{ y: '100%' }"
          :animate="{ y: 0 }"
          :exit="{ y: '100%' }"
          :transition="spring.card"
        >
          <div class="relative mx-auto w-fit">
            <MascotBlob mood="celebrating" :size="130" />
            <motion.span
              class="absolute -right-6 bottom-2"
              :initial="{ scale: 0, rotate: -40 }"
              :animate="{ scale: 1, rotate: 8 }"
              :transition="{ ...spring.jelly, delay: 0.3 }"
            >
              <StickerIcon :name="claimed.reward.sticker" :size="64" />
            </motion.span>
          </div>
          <h2 class="mt-4 text-[30px] font-extrabold leading-tight">¡{{ claimed.reward.name }} es tuyo!</h2>
          <p class="mx-auto mt-2 max-w-[300px] text-[15px] font-medium text-ink-2">
            {{ claimed.res.whatsappUrl ? 'Avísale por WhatsApp para que te lo entregue.' : 'Quedó registrado. ¡Pronto te lo entregan!' }}
          </p>
          <div class="mt-6 grid gap-2">
            <a
              v-if="claimed.res.whatsappUrl"
              :href="claimed.res.whatsappUrl"
              target="_blank"
              rel="noopener"
              class="flex h-[60px] items-center justify-center gap-2 rounded-full bg-[#25D366] font-display text-[17px] font-bold text-white"
              @click="claimed = null"
            >
              <PhWhatsappLogo :size="24" weight="fill" /> Avisar por WhatsApp
            </a>
            <BaseButton :variant="claimed.res.whatsappUrl ? 'ghost' : 'night'" size="lg" block @click="claimed = null">
              {{ claimed.res.whatsappUrl ? 'Después' : '¡Listo!' }}
            </BaseButton>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  </main>
</template>
