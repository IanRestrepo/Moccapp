<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { motion } from 'motion-v'
import { PhArrowLeft, PhArrowRight, PhBookOpenText, PhGift, PhPuzzlePiece } from '@phosphor-icons/vue'
import type { GamesDTO } from '@vetquiz/shared'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import MoccaPack from '@/components/games/MoccaPack.vue'
import { api, ApiRequestError } from '@/api/client'
import { colorClasses, spring } from '@/lib/motion'

/** Jueguitos: elige un tema y juega su sopa de letras. Cada sopa terminada da un sobre de Moccas. */
const router = useRouter()
const data = ref<GamesDTO | null>(null)
const error = ref('')

onMounted(async () => {
  try {
    data.value = await api.games()
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No pude abrir los jueguitos.'
  }
})

const playable = computed(() => (data.value?.sources ?? []).filter((s) => s.words >= 4))
const pending = computed(() => (data.value?.sources ?? []).filter((s) => s.words < 4))
</script>

<template>
  <main class="mx-auto max-w-[440px] px-4 pb-32 pt-5 sm:max-w-2xl">
    <header class="flex items-center gap-3">
      <button class="grid size-11 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Volver" @click="router.back()">
        <PhArrowLeft :size="20" weight="bold" />
      </button>
      <h1 class="flex-1 font-display text-[24px] font-extrabold tracking-[-0.02em]">Jueguitos</h1>
    </header>

    <p v-if="error" class="mt-4 rounded-[20px] bg-pink-tint px-4 py-3 text-[14px] font-semibold">{{ error }}</p>

    <template v-if="data">
      <!-- sobres y álbum -->
      <RouterLink to="/album" class="relative mt-5 flex items-center gap-4 overflow-hidden rounded-card-lg bg-night p-5 text-white">
        <MoccaPack :size="74" :shine="data.packs > 0" class="shrink-0" />
        <span class="min-w-0 flex-1">
          <span class="block font-display text-[20px] font-extrabold leading-tight">
            {{ data.packs ? `Tienes ${data.packs} ${data.packs === 1 ? 'sobre' : 'sobres'} sin abrir` : 'Tu álbum de Moccas' }}
          </span>
          <span class="mt-0.5 block text-[13.5px] font-medium text-white/70">
            {{ data.packs ? 'Ábrelos y descubre qué Moccas te salen.' : 'Cada sopa terminada te da un sobre.' }}
          </span>
          <span class="mt-1.5 block text-[12.5px] font-bold text-white/55">Hoy: {{ data.packsToday }}/{{ data.dailyLimit }} sobres ganados</span>
        </span>
        <PhArrowRight :size="20" weight="bold" class="shrink-0" />
      </RouterLink>

      <h2 class="mt-7 flex items-center gap-2 text-[20px] font-bold"><PhPuzzlePiece :size="22" weight="fill" class="text-pink" /> Sopa de letras</h2>
      <p class="mt-1 text-[14px] text-ink-2">Lee la pista, encuentra la palabra y pasa el dedo sobre ella. Las palabras salen de la guía de cada tema.</p>

      <ul class="mt-4 flex flex-col gap-2.5">
        <motion.li
          v-for="(s, i) in playable"
          :key="s.id"
          :initial="{ opacity: 0, y: 10 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ ...spring.card, delay: i * 0.04 }"
        >
          <button
            class="flex w-full items-center gap-3 rounded-[22px] bg-surface p-3.5 text-left ring-1 ring-line transition-transform active:scale-[0.98]"
            @click="router.push(`/jugar/sopa/${s.id}`)"
          >
            <span :class="['grid size-12 shrink-0 place-items-center rounded-[16px] font-display text-[20px] font-extrabold', colorClasses[s.color].solid]">
              {{ s.title.charAt(0) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-display text-[16px] font-extrabold leading-tight">{{ s.title }}</span>
              <span class="block text-[13px] font-semibold text-ink-2">{{ s.words }} palabras para buscar</span>
            </span>
            <PhGift :size="20" weight="fill" class="shrink-0 text-yellow" />
          </button>
        </motion.li>
      </ul>

      <div v-if="!playable.length" class="mt-6 flex flex-col items-center text-center">
        <MascotBlob mood="thinking" :size="110" />
        <p class="mt-3 font-display text-[18px] font-bold">Todavía no hay sopas</p>
        <p class="mt-1 max-w-[300px] text-[14px] text-ink-2">Las palabras salen de las guías de estudio. Abre la guía de un tema y vuelve aquí.</p>
      </div>

      <template v-if="pending.length">
        <p class="mt-7 text-[13px] font-bold text-ink-2">Necesitan guía primero</p>
        <ul class="mt-2 flex flex-col gap-1.5">
          <li v-for="s in pending" :key="s.id">
            <button class="flex w-full items-center gap-3 rounded-[16px] bg-surface-2 px-3.5 py-2.5 text-left" @click="router.push(`/guia/${s.id}`)">
              <PhBookOpenText :size="19" weight="bold" class="shrink-0 text-ink-2" />
              <span class="min-w-0 flex-1 truncate text-[14px] font-semibold">{{ s.title }}</span>
              <span class="shrink-0 text-[12.5px] font-bold text-lilac">{{ s.guide === 'generating' ? 'Preparándose…' : 'Abrir guía' }}</span>
            </button>
          </li>
        </ul>
      </template>
    </template>

    <div v-else-if="!error" class="mt-24 flex justify-center"><MascotBlob mood="thinking" :size="100" /></div>
  </main>
</template>
