<script setup lang="ts">
import { motion, AnimatePresence } from 'motion-v'
import { PhX } from '@phosphor-icons/vue'

/** Hoja que sube desde abajo (celular). Se cierra tocando afuera o la X. */
defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <AnimatePresence>
    <motion.div
      v-if="open"
      class="fixed inset-0 z-[70] flex items-end justify-center bg-black/50"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :exit="{ opacity: 0 }"
      @click.self="emit('close')"
    >
      <motion.div
        role="dialog"
        :aria-label="title"
        class="flex max-h-[88dvh] w-full max-w-[560px] flex-col rounded-t-[28px] bg-bg pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        :initial="{ y: 400 }"
        :animate="{ y: 0 }"
        :exit="{ y: 400 }"
        :transition="{ type: 'spring', stiffness: 320, damping: 32 }"
      >
        <header class="flex items-center gap-3 px-5 pb-3 pt-5">
          <h2 class="flex-1 font-display text-[22px] font-extrabold leading-tight">{{ title }}</h2>
          <button class="grid size-10 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Cerrar" @click="emit('close')">
            <PhX :size="18" weight="bold" />
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto px-5">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="px-5 pt-4">
          <slot name="footer" />
        </footer>
      </motion.div>
    </motion.div>
  </AnimatePresence>
</template>
