<script setup lang="ts">
import { ref } from 'vue'
import MascotBlob, { type MascotMood } from '@/components/mascot/MascotBlob.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import PerfectCelebration from '@/components/results/PerfectCelebration.vue'

const celebrate = ref(false)

// Página de referencia de la mascota (solo dev): #/mocca
const moods: { mood: MascotMood; label: string; bg: string }[] = [
  { mood: 'happy', label: 'Feliz', bg: 'bg-lilac' },
  { mood: 'thinking', label: 'Pensando', bg: 'bg-sky' },
  { mood: 'surprised', label: 'Sorprendida', bg: 'bg-yellow' },
  { mood: 'celebrating', label: 'Celebrando', bg: 'bg-mint' },
  { mood: 'sad', label: 'Triste', bg: 'bg-pink' },
  { mood: 'amazed', label: 'Asombrada', bg: 'bg-sky' },
  { mood: 'proud', label: 'Orgullosa', bg: 'bg-mint' },
  { mood: 'angry', label: 'Enojada', bg: 'bg-pink' },
  { mood: 'sleepy', label: 'Adormilada', bg: 'bg-lilac' },
  { mood: 'excited', label: 'Emocionada', bg: 'bg-yellow' },
  { mood: 'nervous', label: 'Nerviosa', bg: 'bg-lilac' },
  { mood: 'confused', label: 'Confundida', bg: 'bg-pink' },
  { mood: 'curious', label: 'Curiosa', bg: 'bg-orange' },
  { mood: 'shy', label: 'Tímida', bg: 'bg-lilac' },
  { mood: 'inlove', label: 'Enamorada', bg: 'bg-pink' },
  { mood: 'anxious', label: 'Ansiosa', bg: 'bg-lilac' },
  { mood: 'relieved', label: 'Aliviada', bg: 'bg-mint' },
  { mood: 'motivated', label: 'Motivada', bg: 'bg-yellow' },
  { mood: 'relaxed', label: 'Relajada', bg: 'bg-lilac' },
  { mood: 'bored', label: 'Aburrida', bg: 'bg-orange' },
  { mood: 'eager', label: 'Con ganas', bg: 'bg-pink' },
  { mood: 'hungry', label: 'Hambrienta', bg: 'bg-yellow' },
  { mood: 'scared', label: 'Miedosa', bg: 'bg-lilac' },
  { mood: 'confident', label: 'Segura', bg: 'bg-yellow' },
  { mood: 'delighted', label: 'Sorpresa feliz', bg: 'bg-pink' },
]
</script>

<template>
  <main class="mx-auto max-w-[440px] px-4 pb-32 pt-6">
    <h1 class="text-mega font-extrabold">Mocca</h1>
    <div class="mt-6 grid grid-cols-2 gap-3">
      <figure
        v-for="(m, i) in moods"
        :key="m.mood"
        :class="['flex flex-col items-center rounded-card pb-4 pt-8 text-on-color', m.bg, i === 0 && 'col-span-2']"
      >
        <MascotBlob :mood="m.mood" :size="i === 0 ? 190 : 120" />
        <figcaption class="mt-3 font-display text-[17px] font-bold">{{ m.label }}</figcaption>
      </figure>
    </div>
    <BaseButton class="mt-6" variant="primary" size="xl" block @click="celebrate = true">Probar celebración de examen perfecto</BaseButton>
    <PerfectCelebration :open="celebrate" :xp="215" :streak="4" :time-sec="567" :limit-sec="1800" :bones="63" @close="celebrate = false" />
  </main>
</template>
