<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { AnimatePresence, motion } from 'motion-v'

/** Frases que rotan mientras Gemini genera el banco, para que la espera se sienta viva. */
const props = defineProps<{ video?: boolean }>()

const messages = computed(() => [
  props.video ? 'Viendo el video con atención…' : 'Leyendo tus apuntes…',
  'Encontrando los temas importantes…',
  'Escribiendo preguntas de memoria…',
  'Armando casos tipo parcial…',
  'Copiando datos y cifras tal cual…',
  'Revisando que todo salga de tu fuente…',
])
const i = ref(0)
const timer = window.setInterval(() => (i.value = (i.value + 1) % messages.value.length), 3800)
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="relative h-6 w-full overflow-hidden" aria-live="polite">
    <AnimatePresence mode="wait">
      <motion.p
        :key="i"
        class="text-[15px] font-semibold text-ink-2"
        :initial="{ opacity: 0, y: 10 }"
        :animate="{ opacity: 1, y: 0 }"
        :exit="{ opacity: 0, y: -10 }"
        :transition="{ duration: 0.25 }"
      >
        {{ messages[i] }}
      </motion.p>
    </AnimatePresence>
  </div>
</template>
