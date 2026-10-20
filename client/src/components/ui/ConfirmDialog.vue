<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import { spring } from '@/lib/motion'
import BaseButton from './BaseButton.vue'
import MascotBlob, { type MascotMood } from '../mascot/MascotBlob.vue'

/** Confirmación con Mocca (salir del examen, enviar con preguntas en blanco…). */
defineProps<{ open: boolean; title: string; body?: string; confirm: string; cancel?: string; mood?: MascotMood; primary?: boolean }>()
defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <AnimatePresence>
    <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" @keydown.esc="$emit('cancel')">
      <motion.div
        class="absolute inset-0 bg-[#16141c]/55"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        @click="$emit('cancel')"
      />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        class="relative w-full rounded-t-[34px] bg-bg px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-6 text-center sm:max-w-[420px] sm:rounded-[34px]"
        :initial="{ y: '100%' }"
        :animate="{ y: 0 }"
        :exit="{ y: '100%' }"
        :transition="spring.card"
      >
        <MascotBlob class="mx-auto" :mood="mood ?? 'surprised'" :size="96" />
        <h2 class="mt-3 text-[26px] font-extrabold leading-tight">{{ title }}</h2>
        <p v-if="body" class="mx-auto mt-2 max-w-[320px] text-[15px] font-medium text-ink-2">{{ body }}</p>
        <div class="mt-6 grid gap-2">
          <BaseButton :variant="primary ? 'primary' : 'night'" size="xl" block @click="$emit('confirm')">{{ confirm }}</BaseButton>
          <BaseButton variant="ghost" size="md" block @click="$emit('cancel')">{{ cancel ?? 'Cancelar' }}</BaseButton>
        </div>
      </motion.div>
    </div>
  </AnimatePresence>
</template>
