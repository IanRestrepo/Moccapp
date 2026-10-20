<script setup lang="ts">
import { ref } from 'vue'
import { motion } from 'motion-v'
import { PhLockKey } from '@phosphor-icons/vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import { api, ApiRequestError } from '@/api/client'

/** Pantalla de entrada cuando la app está en internet. Se pide una sola vez por dispositivo. */
const code = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const shake = ref(0)

async function enter() {
  if (!code.value.trim() || busy.value) return
  busy.value = true
  error.value = null
  try {
    await api.enter(code.value)
    location.reload() // vuelve a cargar todo ya con acceso
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No se pudo entrar. Revisa tu conexión.'
    shake.value++
    busy.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-[400px] flex-col items-center justify-center px-6 text-center">
    <MascotBlob :mood="error ? 'sad' : 'happy'" :size="150" />
    <h1 class="mt-5 text-mega font-extrabold">¡Hola!</h1>
    <p class="mt-2 text-[16px] font-medium text-ink-2">Escribe tu código de acceso. Solo te lo pido una vez en este dispositivo.</p>

    <motion.form
      :key="shake"
      class="mt-7 w-full"
      :initial="{ x: 0 }"
      :animate="shake ? { x: [0, -8, 8, -4, 0] } : {}"
      @submit.prevent="enter"
    >
      <label class="flex h-14 items-center gap-2 rounded-full bg-surface px-5 ring-1 ring-line focus-within:ring-[2.5px] focus-within:ring-lilac">
        <PhLockKey :size="20" weight="bold" class="shrink-0 text-ink-3" />
        <input
          v-model="code"
          type="password"
          autocomplete="current-password"
          autofocus
          class="h-full min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-ink-3 focus:outline-none"
          placeholder="Código de acceso"
          aria-label="Código de acceso"
        />
      </label>
      <p v-if="error" role="alert" class="mt-3 text-[14px] font-semibold text-danger">{{ error }}</p>
      <BaseButton class="mt-5" type="submit" variant="primary" size="xl" block :loading="busy" :disabled="!code.trim()">Entrar</BaseButton>
    </motion.form>
  </main>
</template>
