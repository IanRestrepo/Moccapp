<script setup lang="ts">
import { ref, watch } from 'vue'

/** Respuesta abierta corta. Emite con pausa para no guardar en cada tecla. */
const props = defineProps<{ modelValue: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const text = ref(props.modelValue ?? '')
let timer: number | undefined
watch(text, (v) => {
  clearTimeout(timer)
  timer = window.setTimeout(() => emit('update:modelValue', v), 600)
})
watch(
  () => props.modelValue,
  (v) => {
    if ((v ?? '') !== text.value && document.activeElement?.tagName !== 'TEXTAREA') text.value = v ?? ''
  },
)
</script>

<template>
  <div>
    <textarea
      v-model="text"
      rows="6"
      maxlength="2000"
      class="block w-full resize-none rounded-[24px] bg-surface p-4 text-[16px] leading-relaxed ring-1 ring-line placeholder:text-ink-3 focus:outline-none focus:ring-[2.5px] focus:ring-lilac"
      placeholder="Escribe tu respuesta en 1 a 3 frases…"
      aria-label="Tu respuesta"
    />
    <p class="mt-2 px-1 text-[13px] font-medium text-ink-2">Mocca la corrige al final, con crédito parcial si vas por buen camino.</p>
  </div>
</template>
