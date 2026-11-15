<script setup lang="ts">
import { ref, watch } from 'vue'
import { PhSignOut } from '@phosphor-icons/vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { api, ApiRequestError } from '@/api/client'
import { useUiStore } from '@/stores/ui'

/** Mi cuenta: ver el usuario, cambiar la contraseña y salir de este dispositivo. */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const ui = useUiStore()

const current = ref('')
const password = ref('')
const password2 = ref('')
const busy = ref(false)
const msg = ref('')
const error = ref('')

watch(
  () => props.open,
  (o) => {
    if (!o) return
    current.value = password.value = password2.value = ''
    msg.value = error.value = ''
  },
)

async function change() {
  error.value = msg.value = ''
  if (password.value !== password2.value) return (error.value = 'Las dos contraseñas nuevas no son iguales.')
  if (password.value.length < 6) return (error.value = 'La contraseña necesita al menos 6 caracteres.')
  busy.value = true
  try {
    await api.changePassword(current.value, password.value)
    msg.value = '¡Listo! Tu contraseña cambió. En los otros dispositivos tendrás que volver a entrar.'
    current.value = password.value = password2.value = ''
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No se pudo cambiar. Revisa tu conexión.'
  } finally {
    busy.value = false
  }
}

async function logout() {
  await api.logout().catch(() => {})
  location.reload()
}

const field = 'w-full rounded-full bg-surface px-5 py-3.5 text-[16px] ring-1 ring-line placeholder:text-ink-3 focus:outline-none focus:ring-[2.5px] focus:ring-lilac'
</script>

<template>
  <BottomSheet :open="open" title="Mi cuenta" @close="emit('close')">
    <div class="flex flex-col gap-3 pb-2">
      <p class="-mt-1 text-[15px] font-semibold text-ink-2">
        Usuario: <span class="font-extrabold text-ink">{{ ui.username }}</span>
      </p>

      <form class="mt-2 flex flex-col gap-2.5" @submit.prevent="change">
        <h3 class="text-[16px] font-bold">Cambiar contraseña</h3>
        <input v-model="current" type="password" autocomplete="current-password" :class="field" placeholder="Contraseña actual" aria-label="Contraseña actual" />
        <input v-model="password" type="password" autocomplete="new-password" :class="field" placeholder="Contraseña nueva (mín. 6)" aria-label="Contraseña nueva" />
        <input v-model="password2" type="password" autocomplete="new-password" :class="field" placeholder="Repite la nueva" aria-label="Repite la contraseña nueva" />
        <p v-if="error" role="alert" class="text-[14px] font-semibold text-danger">{{ error }}</p>
        <p v-if="msg" class="text-[14px] font-semibold text-success">{{ msg }}</p>
        <BaseButton type="submit" variant="primary" size="lg" block :loading="busy" :disabled="!current || !password || !password2">Cambiar contraseña</BaseButton>
      </form>

      <button class="mt-3 flex items-center justify-center gap-2 rounded-full py-3 text-[15px] font-bold text-danger" @click="logout">
        <PhSignOut :size="19" weight="bold" /> Salir de este dispositivo
      </button>
    </div>
  </BottomSheet>
</template>
