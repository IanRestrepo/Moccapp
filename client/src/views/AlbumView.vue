<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import confetti from 'canvas-confetti'
import { PhArrowLeft, PhPuzzlePiece, PhX } from '@phosphor-icons/vue'
import { MOCCA_INFO, MOCCA_RARITY_LABEL, type MoccaAlbumDTO, type MoccaMood, type MoccaRarity, type OpenPackResponse } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import MoccaCard from '@/components/games/MoccaCard.vue'
import MoccaPack from '@/components/games/MoccaPack.vue'
import { api, ApiRequestError } from '@/api/client'
import { useSound } from '@/composables/useSound'

/**
 * Álbum de Moccas: las 25, por rareza (las que no tiene salen como silueta). Arriba, los sobres sin abrir.
 * Abrir un sobre: tiembla, se rasga, salen 3 cartas boca abajo y se voltean una por una; la legendaria explota en dorado.
 */
const route = useRoute()
const router = useRouter()
const { play } = useSound()
const album = ref<MoccaAlbumDTO | null>(null)
const error = ref('')

async function load() {
  try {
    album.value = await api.album()
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude abrir tu álbum.'
  }
}
onMounted(async () => {
  await load()
  // viene de ganar un sobre: abre de una
  if (route.query.abrir && album.value?.packs) startOpening()
})

const owned = computed(() => new Map((album.value?.cards ?? []).map((c) => [c.mood, c.count])))
const RARITIES: MoccaRarity[] = ['legendary', 'special', 'normal']
const groups = computed(() =>
  RARITIES.map((rarity) => ({
    rarity,
    moods: (album.value?.available ?? []).filter((m) => MOCCA_INFO[m].rarity === rarity),
  })).filter((g) => g.moods.length),
)
const total = computed(() => album.value?.available.length ?? 0)
const have = computed(() => (album.value?.available ?? []).filter((m) => owned.value.has(m)).length)

// ── Abrir un sobre ──
type Phase = 'pack' | 'tearing' | 'cards'
const opening = ref(false)
const phase = ref<Phase>('pack')
const pull = ref<OpenPackResponse | null>(null)
const flipped = ref<boolean[]>([])
const busy = ref(false)
const shake = ref(0)

function startOpening() {
  opening.value = true
  phase.value = 'pack'
  pull.value = null
  flipped.value = []
}
async function tear() {
  if (busy.value || phase.value !== 'pack') return
  busy.value = true
  shake.value++
  play('tap')
  try {
    // mientras pide las cartas, el sobre tiembla
    const [res] = await Promise.all([api.openPack(), new Promise((r) => setTimeout(r, 650))])
    pull.value = res
    flipped.value = res.cards.map(() => false)
    phase.value = 'tearing'
    play('whoosh')
    setTimeout(() => {
      phase.value = 'cards'
      play('pop')
    }, 520)
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude abrir el sobre.'
    opening.value = false
  } finally {
    busy.value = false
  }
}
function flip(i: number) {
  if (flipped.value[i] || !pull.value) return
  flipped.value = flipped.value.map((f, k) => f || k === i)
  const card = pull.value.cards[i]!
  if (card.rarity === 'legendary') {
    play('perfect')
    confetti({ particleCount: 140, spread: 110, startVelocity: 45, origin: { y: 0.5 }, shapes: ['star'], colors: ['#fff7c2', '#ffcf3f', '#ff9b45', '#ffffff'], scalar: 1.2 })
    if (navigator.vibrate) navigator.vibrate([30, 40, 60])
  } else if (card.rarity === 'special') {
    play('correct')
    confetti({ particleCount: 50, spread: 70, origin: { y: 0.5 }, colors: ['#c9b6ff', '#ab90f7', '#ffffff'], scalar: 0.8 })
  } else play('select')
}
const allFlipped = computed(() => flipped.value.length > 0 && flipped.value.every(Boolean))
const best = computed<MoccaRarity | null>(() => {
  const cards = pull.value?.cards ?? []
  return cards.some((c) => c.rarity === 'legendary') ? 'legendary' : cards.some((c) => c.rarity === 'special') ? 'special' : cards.length ? 'normal' : null
})
async function afterPack() {
  await load()
  if (album.value?.packs) startOpening()
  else opening.value = false
}
const label = (m: MoccaMood) => MOCCA_INFO[m].label
</script>

<template>
  <main class="mx-auto max-w-[440px] px-4 pb-32 pt-5 sm:max-w-2xl">
    <header class="flex items-center gap-3">
      <button class="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Volver" @click="router.back()">
        <PhArrowLeft :size="20" weight="bold" />
      </button>
      <h1 class="flex-1 font-display text-[24px] font-extrabold tracking-[-0.02em]">Álbum de Moccas</h1>
    </header>

    <p v-if="error" class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>

    <template v-if="album">
      <!-- sobres -->
      <section class="relative mt-5 flex items-center gap-4 overflow-hidden rounded-card-lg bg-night p-5 text-white">
        <MoccaPack :size="80" :shine="album.packs > 0" class="shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="font-display text-[20px] font-extrabold leading-tight">
            {{ album.packs ? `${album.packs} ${album.packs === 1 ? 'sobre' : 'sobres'} por abrir` : 'Sin sobres por ahora' }}
          </p>
          <p class="mt-0.5 text-[13.5px] text-white/70">Cada sobre trae 3 Moccas. Pueden salir especiales y legendarias.</p>
          <BaseButton v-if="album.packs" class="mt-3" size="md" variant="primary" @click="startOpening">Abrir sobre</BaseButton>
          <BaseButton v-else class="mt-3" size="md" variant="surface" @click="router.push('/jugar')">
            <PhPuzzlePiece :size="17" weight="fill" /> Ganar sobres
          </BaseButton>
        </div>
      </section>

      <!-- progreso -->
      <div class="mt-6 flex items-end justify-between">
        <h2 class="text-[20px] font-bold">Tu colección</h2>
        <p class="text-[14px] font-extrabold">{{ have }}/{{ total }}</p>
      </div>
      <div class="mt-2 h-3 overflow-hidden rounded-full bg-surface-2">
        <div class="h-full rounded-full bg-gradient-to-r from-lilac to-yellow transition-[width] duration-700" :style="{ width: `${total ? (have / total) * 100 : 0}%` }" />
      </div>

      <section v-for="g in groups" :key="g.rarity" class="mt-6">
        <p
          :class="[
            'text-[13px] font-extrabold uppercase tracking-wide',
            g.rarity === 'legendary' ? 'text-yellow' : g.rarity === 'special' ? 'text-lilac' : 'text-ink-2',
          ]"
        >
          {{ g.rarity === 'legendary' ? 'Legendarias' : g.rarity === 'special' ? 'Especiales' : 'Normales' }}
          · {{ g.moods.filter((m) => owned.has(m)).length }}/{{ g.moods.length }}
        </p>
        <div class="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
          <MoccaCard v-for="m in g.moods" :key="m" :mood="m" :owned="owned.has(m)" :count="owned.get(m)" />
        </div>
      </section>
    </template>

    <div v-else-if="!error" class="mt-24 flex justify-center"><MascotBlob mood="thinking" :size="100" /></div>

    <!-- ── abrir sobre ── -->
    <div v-if="opening" class="opening fixed inset-0 z-[60] flex flex-col items-center justify-center px-4" role="dialog" aria-modal="true" aria-label="Abrir sobre">
      <button
        v-if="phase === 'pack' && !busy"
        class="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] grid size-11 place-items-center rounded-full bg-white/10 text-white"
        aria-label="Cerrar"
        @click="opening = false"
      >
        <PhX :size="20" weight="bold" />
      </button>

      <!-- el sobre -->
      <template v-if="phase !== 'cards'">
        <p class="mb-6 font-display text-[22px] font-extrabold text-white">{{ busy ? '¡Abriendo…!' : 'Toca el sobre para abrirlo' }}</p>
        <button :key="shake" :class="['pack-btn', busy && 'pack-btn--shake', phase === 'tearing' && 'pack-btn--tear']" aria-label="Abrir el sobre" @click="tear">
          <MoccaPack :size="170" shine />
        </button>
        <span v-if="phase === 'tearing'" class="flash" />
      </template>

      <!-- las cartas -->
      <template v-else-if="pull">
        <p class="mb-5 font-display text-[22px] font-extrabold text-white">
          {{
            !allFlipped
              ? 'Toca cada carta para voltearla'
              : best === 'legendary'
                ? '¡Te salió una LEGENDARIA!'
                : best === 'special'
                  ? '¡Te salió una especial!'
                  : '¡Nuevas Moccas!'
          }}
        </p>
        <div class="flex flex-wrap justify-center gap-3">
          <button
            v-for="(c, i) in pull.cards"
            :key="i"
            class="flip"
            :class="flipped[i] && 'flip--on'"
            :style="{ animationDelay: `${i * 0.12}s` }"
            :aria-label="flipped[i] ? `${label(c.mood)}, ${MOCCA_RARITY_LABEL[c.rarity]}` : `Voltear la carta ${i + 1}`"
            @click="flip(i)"
          >
            <span class="flip-inner">
              <span class="flip-back">
                <span class="back-m">M</span>
              </span>
              <span :class="['flip-front', `glow--${c.rarity}`]">
                <MoccaCard :mood="c.mood" owned :is-new="c.isNew" :count="c.count" size="lg" />
              </span>
            </span>
          </button>
        </div>
        <div class="mt-8 flex h-14 items-center">
          <BaseButton v-if="allFlipped" size="xl" variant="primary" @click="afterPack">
            {{ pull.packs > 0 ? `Abrir otro (${pull.packs})` : 'Ver mi álbum' }}
          </BaseButton>
        </div>
      </template>
    </div>
  </main>
</template>

<style scoped>
.opening {
  background: radial-gradient(circle at 50% 42%, #3a2a6e 0%, #1a1426 60%, #0e0b14 100%);
  animation: fade-in 0.250s ease-out both;
}
.pack-btn {
  animation: pack-in 0.500s cubic-bezier(0.2, 1.3, 0.4, 1) both;
}
.pack-btn--shake {
  animation: pack-shake 0.110s linear infinite;
}
.pack-btn--tear {
  animation: pack-tear 0.520s cubic-bezier(0.5, 0, 0.8, 0.4) both;
}
.flash {
  position: fixed;
  inset: 0;
  background: #fff;
  pointer-events: none;
  animation: flash 0.550s ease-out both;
}
.flip {
  width: 148px;
  height: 196px;
  perspective: 800px;
  animation: card-in 0.550s cubic-bezier(0.2, 1.3, 0.4, 1) both;
}
.flip-inner {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.600s cubic-bezier(0.3, 1.3, 0.5, 1);
}
.flip--on .flip-inner {
  transform: rotateY(180deg);
}
.flip-back,
.flip-front {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  backface-visibility: hidden;
  border-radius: 18px;
}
.flip-back {
  border: 3px solid #2a1810;
  background:
    radial-gradient(circle at 50% 50%, #9a7bf0 0 30%, transparent 31%),
    repeating-linear-gradient(45deg, #6f50d1 0 10px, #7d5ee0 10px 20px);
  box-shadow: 0 8px 0 rgba(0, 0, 0, 0.35);
}
.flip:not(.flip--on) .flip-back {
  animation: wiggle 1.800s ease-in-out infinite;
}
.back-m {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  border: 4px solid #2a1810;
  background: #ffcf3f;
  font-family: var(--font-display, inherit);
  font-size: 30px;
  font-weight: 900;
  color: #2a1810;
}
.flip-front {
  transform: rotateY(180deg);
}
.glow--legendary {
  filter: drop-shadow(0 0 18px rgba(255, 207, 63, 0.950)) drop-shadow(0 0 36px rgba(255, 160, 40, 0.700));
}
.glow--special {
  filter: drop-shadow(0 0 14px rgba(201, 182, 255, 0.900));
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
}
@keyframes pack-in {
  from {
    transform: scale(0.3) rotate(-20deg);
    opacity: 0;
  }
}
@keyframes pack-shake {
  0%,
  100% {
    transform: rotate(-4deg) scale(1.03);
  }
  50% {
    transform: rotate(4deg) scale(1.06);
  }
}
@keyframes pack-tear {
  30% {
    transform: scale(1.18);
  }
  100% {
    transform: scale(0.2) translateY(-120px) rotate(30deg);
    opacity: 0;
  }
}
@keyframes flash {
  0% {
    opacity: 0;
  }
  35% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
  }
}
@keyframes card-in {
  from {
    transform: translateY(160px) scale(0.4) rotate(-12deg);
    opacity: 0;
  }
}
@keyframes wiggle {
  0%,
  100% {
    transform: rotate(0);
  }
  10% {
    transform: rotate(-3deg);
  }
  20% {
    transform: rotate(3deg);
  }
  30% {
    transform: rotate(0);
  }
}
</style>
