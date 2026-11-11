<script setup lang="ts">
import { motion } from 'motion-v'
import { PhPause, PhPlay, PhSkipBack, PhSkipForward, PhX } from '@phosphor-icons/vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'

/** Barra de "audiolibro" abajo de la guía: qué tema va, progreso, saltar de tema, pausa y velocidad */
defineProps<{
  playing: boolean
  title: string
  label: string
  progress: number
  rate: number
  /** "Lo que va diciendo", para leer a la par */
  line: string
  barClass: string
  /** El celular no pudo hablar */
  failed?: boolean
}>()
defineEmits<{ toggle: []; prev: []; next: []; rate: []; close: [] }>()
</script>

<template>
  <motion.div
    class="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    :initial="{ y: 160 }"
    :animate="{ y: 0 }"
    :exit="{ y: 160 }"
    :transition="{ type: 'spring', stiffness: 320, damping: 30 }"
  >
    <div class="mx-auto max-w-[560px] overflow-hidden rounded-[26px] bg-night text-white shadow-float">
      <!-- progreso de toda la guía -->
      <div class="h-1.5 bg-white/10">
        <div :class="['h-full transition-[width] duration-500', barClass]" :style="{ width: `${Math.round(progress * 100)}%` }" />
      </div>
      <div class="flex items-center gap-3 px-3 pt-3">
        <motion.div :animate="playing ? { rotate: [0, -5, 5, 0] } : { rotate: 0 }" :transition="{ duration: 1.6, repeat: playing ? Infinity : 0 }">
          <MascotBlob :mood="playing ? 'happy' : 'thinking'" :size="46" />
        </motion.div>
        <div class="min-w-0 flex-1">
          <p class="text-[11.5px] font-bold uppercase tracking-wide text-white/55">{{ label }}</p>
          <p class="truncate font-display text-[15.5px] font-extrabold leading-tight">{{ title }}</p>
        </div>
        <button class="grid size-9 shrink-0 place-items-center rounded-full bg-white/10" aria-label="Cerrar el audio" @click="$emit('close')">
          <PhX :size="16" weight="bold" />
        </button>
      </div>
      <p v-if="failed" class="mx-3 mt-2 rounded-[14px] bg-pink/25 px-3 py-2 text-[13px] font-semibold leading-snug">
        Tu celular no pudo leer en voz alta. Revisa que no esté en silencio y que tenga una voz en español
        (Ajustes → Accesibilidad → Texto a voz) e intenta de nuevo.
      </p>
      <p v-else class="mx-3 mt-2 line-clamp-2 min-h-[2.5em] text-[13px] leading-snug text-white/70" aria-live="polite">{{ line }}</p>
      <div class="flex items-center justify-between px-3 pb-3 pt-2">
        <button class="h-10 w-14 rounded-full bg-white/10 text-[13.5px] font-extrabold" aria-label="Cambiar velocidad" @click="$emit('rate')">
          {{ String(rate).replace('.', ',') }}×
        </button>
        <div class="flex items-center gap-3">
          <button class="grid size-11 place-items-center rounded-full bg-white/10" aria-label="Tema anterior" @click="$emit('prev')">
            <PhSkipBack :size="20" weight="fill" />
          </button>
          <button class="grid size-14 place-items-center rounded-full bg-white text-night" :aria-label="playing ? 'Pausar' : 'Seguir escuchando'" @click="$emit('toggle')">
            <component :is="playing ? PhPause : PhPlay" :size="26" weight="fill" />
          </button>
          <button class="grid size-11 place-items-center rounded-full bg-white/10" aria-label="Tema siguiente" @click="$emit('next')">
            <PhSkipForward :size="20" weight="fill" />
          </button>
        </div>
        <span class="w-14" />
      </div>
    </div>
  </motion.div>
</template>
