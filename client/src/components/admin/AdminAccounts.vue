<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PhKey, PhUserCircle } from '@phosphor-icons/vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { api, ApiRequestError, type AdminAccount } from '@/api/client'

/** Cuentas: el usuario de cada persona y poner una contraseña nueva (si la olvidó). */
const emit = defineEmits<{ toast: [ok: boolean, text: string] }>()
const accounts = ref<AdminAccount[]>([])
const editing = ref<string | null>(null)
const username = ref('')
const password = ref('')
const show = ref(false)
const busy = ref(false)
const error = ref('')

onMounted(async () => {
  accounts.value = await api.adminAccounts().catch(() => [])
})

function open(a: AdminAccount) {
  editing.value = editing.value === a.profile ? null : a.profile
  username.value = a.username ?? ''
  password.value = ''
  show.value = false
  error.value = ''
}

async function save(a: AdminAccount) {
  error.value = ''
  busy.value = true
  try {
    const updated = await api.adminSetAccount(a.profile, { username: username.value.trim() || undefined, password: password.value })
    accounts.value = accounts.value.map((x) => (x.profile === a.profile ? updated : x))
    editing.value = null
    password.value = ''
    emit('toast', true, `Listo: ${a.name} ya puede entrar con su usuario y la contraseña nueva.`)
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'No se pudo guardar.'
  } finally {
    busy.value = false
  }
}

const field = 'w-full rounded-full bg-bg px-5 py-3.5 text-[16px] ring-1 ring-line placeholder:text-ink-3 focus:outline-none focus:ring-[2.5px] focus:ring-lilac'
</script>

<template>
  <h2 class="mt-8 text-[22px] font-bold">Cuentas</h2>
  <p class="mt-1 text-[14px] text-ink-2">El usuario de cada persona. Si alguien olvidó su contraseña, ponle una nueva aquí (sus otros dispositivos tendrán que volver a entrar).</p>
  <ul class="mt-3 flex flex-col gap-2.5">
    <li v-for="a in accounts" :key="a.profile" class="rounded-[20px] bg-surface p-4 ring-1 ring-line">
      <div class="flex items-center gap-3">
        <PhUserCircle :size="26" weight="bold" class="shrink-0" />
        <span class="min-w-0 flex-1">
          <span class="block font-display text-[16px] font-bold">{{ a.name }}</span>
          <span class="block text-[13px] font-semibold text-ink-2">{{ a.username ? `Usuario: ${a.username}` : 'Todavía no ha creado su usuario' }}</span>
        </span>
        <button class="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 py-2 text-[13px] font-bold" @click="open(a)">
          <PhKey :size="15" weight="bold" /> {{ editing === a.profile ? 'Cerrar' : 'Contraseña' }}
        </button>
      </div>
      <form v-if="editing === a.profile" class="mt-3 flex flex-col gap-2.5" @submit.prevent="save(a)">
        <input
          v-model="username"
          type="text"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          autocomplete="off"
          :class="field"
          placeholder="Usuario"
          aria-label="Usuario"
        />
        <input
          v-model="password"
          :type="show ? 'text' : 'password'"
          autocomplete="new-password"
          :class="field"
          placeholder="Contraseña nueva (mín. 6)"
          aria-label="Contraseña nueva"
        />
        <label class="flex items-center gap-2 px-2 text-[13.5px] font-semibold text-ink-2">
          <input v-model="show" type="checkbox" class="size-4 accent-[var(--vq-lilac)]" /> Mostrar la contraseña
        </label>
        <p class="px-2 text-[12.5px] text-ink-3">La contraseña distingue mayúsculas y minúsculas; el usuario no.</p>
        <p v-if="error" role="alert" class="px-2 text-[14px] font-semibold text-danger">{{ error }}</p>
        <BaseButton type="submit" variant="night" size="lg" block :loading="busy" :disabled="password.length < 6 || !username.trim()">Guardar</BaseButton>
      </form>
    </li>
  </ul>
</template>
