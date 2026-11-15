<script setup lang="ts">
import { computed, ref } from 'vue'
import { motion } from 'motion-v'
import { PhEye, PhEyeSlash, PhKey, PhLockKey, PhUser } from '@phosphor-icons/vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import { api, ApiRequestError } from '@/api/client'

/**
 * Entrada a la app (cuando está en internet): usuario y contraseña.
 * La primera vez se entra con el código de siempre y se crea el usuario; con el código también se recupera la contraseña.
 */
const props = defineProps<{ needsAccount?: boolean; name?: string | null }>()

type Mode = 'login' | 'code' | 'setup' | 'reset'
const mode = ref<Mode>(props.needsAccount ? 'setup' : 'login')
const who = ref(props.name ?? null)

const username = ref('')
const password = ref('')
const password2 = ref('')
const code = ref('')
const show = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const shake = ref(0)

const titles: Record<Mode, { h: string; p: string; cta: string }> = {
  login: { h: '¡Hola!', p: 'Entra con tu usuario y tu contraseña.', cta: 'Entrar' },
  code: { h: 'Primera vez', p: 'Escribe el código que te dieron. Después creas tu usuario y tu contraseña.', cta: 'Seguir' },
  setup: { h: 'Crea tu usuario', p: 'Con esto vas a entrar de ahora en adelante, en cualquier celular o computador.', cta: 'Crear y entrar' },
  reset: { h: 'Nueva contraseña', p: 'Escribe tu código de siempre y elige una contraseña nueva.', cta: 'Cambiar y entrar' },
}
const t = computed(() => titles[mode.value])

const ready = computed(() => {
  if (mode.value === 'login') return !!username.value.trim() && !!password.value
  if (mode.value === 'code') return !!code.value.trim()
  if (mode.value === 'setup') return !!username.value.trim() && password.value.length > 0 && password2.value.length > 0
  return !!code.value.trim() && password.value.length > 0 && password2.value.length > 0
})

function go(m: Mode) {
  mode.value = m
  error.value = null
  password.value = ''
  password2.value = ''
  show.value = false
}

function fail(msg: string) {
  error.value = msg
  shake.value++
  busy.value = false
}

async function submit() {
  if (!ready.value || busy.value) return
  if ((mode.value === 'setup' || mode.value === 'reset') && password.value !== password2.value) return fail('Las dos contraseñas no son iguales.')
  if ((mode.value === 'setup' || mode.value === 'reset') && password.value.length < 6) return fail('La contraseña necesita al menos 6 caracteres.')
  busy.value = true
  error.value = null
  try {
    if (mode.value === 'login') await api.login(username.value, password.value)
    else if (mode.value === 'setup') await api.setupAccount(username.value, password.value)
    else {
      const status = mode.value === 'code' ? await api.enterCode(code.value) : await api.resetPassword(code.value, password.value)
      if (status.needsAccount) {
        who.value = status.name ?? null
        busy.value = false
        return go('setup')
      }
    }
    location.reload() // vuelve a cargar todo ya con acceso
  } catch (err) {
    if (err instanceof ApiRequestError && err.code === 'ACCOUNT_EXISTS') {
      busy.value = false
      go('login')
      error.value = err.message
      return
    }
    fail(err instanceof ApiRequestError ? err.message : 'No se pudo entrar. Revisa tu conexión.')
  }
}

const field = 'flex h-14 items-center gap-2 rounded-full bg-surface px-5 ring-1 ring-line focus-within:ring-[2.5px] focus-within:ring-lilac'
const input = 'h-full min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-ink-3 focus:outline-none'
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-[400px] flex-col items-center justify-center px-6 py-10 text-center">
    <MascotBlob :mood="error ? 'sad' : mode === 'setup' ? 'excited' : 'happy'" :size="140" />
    <h1 class="mt-5 text-mega font-extrabold">{{ mode === 'setup' && who ? `¡Hola, ${who}!` : t.h }}</h1>
    <p class="mt-2 text-[16px] font-medium text-ink-2">{{ mode === 'setup' && who ? `Crea tu usuario y tu contraseña. ${t.p}` : t.p }}</p>

    <motion.form
      :key="`${mode}-${shake}`"
      class="mt-7 flex w-full flex-col gap-3"
      :initial="{ x: 0 }"
      :animate="shake ? { x: [0, -8, 8, -4, 0] } : {}"
      @submit.prevent="submit"
    >
      <label v-if="mode === 'code' || mode === 'reset'" :class="field">
        <PhKey :size="20" weight="bold" class="shrink-0 text-ink-3" />
        <input v-model="code" type="password" autocomplete="one-time-code" autofocus :class="input" placeholder="Código de acceso" aria-label="Código de acceso" />
      </label>

      <label v-if="mode === 'login' || mode === 'setup'" :class="field">
        <PhUser :size="20" weight="bold" class="shrink-0 text-ink-3" />
        <input
          v-model="username"
          type="text"
          autocomplete="username"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          autofocus
          :class="input"
          :placeholder="mode === 'setup' ? 'Elige tu usuario (ej. ashley)' : 'Usuario'"
          aria-label="Usuario"
        />
      </label>

      <label v-if="mode !== 'code'" :class="field">
        <PhLockKey :size="20" weight="bold" class="shrink-0 text-ink-3" />
        <input
          v-model="password"
          :type="show ? 'text' : 'password'"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          :class="input"
          :placeholder="mode === 'login' ? 'Contraseña' : 'Contraseña nueva (mín. 6)'"
          aria-label="Contraseña"
        />
        <button type="button" class="-mr-2 grid size-10 shrink-0 place-items-center text-ink-3" :aria-label="show ? 'Ocultar contraseña' : 'Ver contraseña'" @click="show = !show">
          <component :is="show ? PhEyeSlash : PhEye" :size="20" weight="bold" />
        </button>
      </label>

      <label v-if="mode === 'setup' || mode === 'reset'" :class="field">
        <PhLockKey :size="20" weight="bold" class="shrink-0 text-ink-3" />
        <input v-model="password2" :type="show ? 'text' : 'password'" autocomplete="new-password" :class="input" placeholder="Repite la contraseña" aria-label="Repite la contraseña" />
      </label>

      <p v-if="error" role="alert" class="text-[14px] font-semibold text-danger">{{ error }}</p>
      <BaseButton class="mt-2" type="submit" variant="primary" size="xl" block :loading="busy" :disabled="!ready">{{ t.cta }}</BaseButton>
    </motion.form>

    <div class="mt-6 flex flex-col items-center gap-3 text-[14.5px] font-bold">
      <template v-if="mode === 'login'">
        <button class="text-lilac" @click="go('code')">¿Primera vez? Entra con tu código</button>
        <button class="text-ink-2" @click="go('reset')">Olvidé mi contraseña</button>
      </template>
      <button v-else-if="mode !== 'setup'" class="text-ink-2" @click="go('login')">Ya tengo usuario</button>
    </div>
  </main>
</template>
