<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { motion, AnimatePresence } from 'motion-v'
import { PhBell, PhDeviceMobile, PhExport, PhPlusSquare, PhX } from '@phosphor-icons/vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { usePhone } from '@/composables/usePhone'

/**
 * Tarjeta en Inicio: 1) agregar Moccapp al inicio del celular, 2) activar los avisos.
 * Desaparece cuando ya está todo, o por una semana si la cierra.
 */
const phone = usePhone()
const DISMISS = 'vq-phone-card'
const WEEK = 7 * 24 * 3600_000
const dismissed = ref(false)
const iosSteps = ref(false)
const busy = ref(false)
const msg = ref('')

onMounted(async () => {
  try {
    dismissed.value = Date.now() - Number(localStorage.getItem(DISMISS) ?? 0) < WEEK
  } catch {
    /* sin almacenamiento */
  }
  await phone.refresh()
})

function dismiss() {
  dismissed.value = true
  try {
    localStorage.setItem(DISMISS, String(Date.now()))
  } catch {
    /* sin almacenamiento */
  }
}

/** Qué falta: instalarla, o los avisos (en iPhone los avisos piden instalarla primero) */
const step = computed<'install' | 'push' | 'denied' | null>(() => {
  if (phone.canInstall.value) return 'install'
  if (phone.canPush.value && !phone.subscribed.value) return phone.permission.value === 'denied' ? 'denied' : 'push'
  return null
})

async function install() {
  if (phone.isIOS) return void (iosSteps.value = true)
  busy.value = true
  await phone.install().finally(() => (busy.value = false))
}

async function enable() {
  busy.value = true
  try {
    const r = await phone.enablePush()
    msg.value =
      r === 'ok' ? '¡Listo! Te llegó un aviso de prueba.' : r === 'denied' ? 'Quedaron bloqueados. Puedes activarlos en los ajustes del celular.' : 'Este navegador no permite avisos.'
  } catch {
    msg.value = 'No se pudo activar. Intenta de nuevo.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section v-if="step && !dismissed" class="relative mt-4 overflow-hidden rounded-card bg-sky p-5 pr-24 text-on-color">
    <button class="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-white/40" aria-label="Ahora no" @click="dismiss">
      <PhX :size="16" weight="bold" />
    </button>
    <span class="pointer-events-none absolute bottom-5 right-5 grid size-16 rotate-6 place-items-center rounded-[20px] bg-white/45">
      <component :is="step === 'install' ? PhDeviceMobile : PhBell" :size="36" weight="fill" />
    </span>

    <template v-if="step === 'install'">
      <p class="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide opacity-70"><PhDeviceMobile :size="16" weight="bold" /> En tu celular</p>
      <h2 class="mt-1 font-display text-[20px] font-extrabold leading-tight">Pon a Mocca en tu inicio</h2>
      <p class="mt-1 text-[14px] font-medium leading-snug opacity-75">Se abre como una app y te puede mandar avisos.</p>
      <BaseButton class="mt-4" size="md" :loading="busy" @click="install">Agregar a inicio</BaseButton>
    </template>

    <template v-else-if="step === 'push'">
      <p class="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide opacity-70"><PhBell :size="16" weight="bold" /> Avisos</p>
      <h2 class="mt-1 font-display text-[20px] font-extrabold leading-tight">¿Te aviso cuando…?</h2>
      <p class="mt-1 text-[14px] font-medium leading-snug opacity-75">Tus fuentes estén listas y para no perder tu racha.</p>
      <BaseButton class="mt-4" size="md" :loading="busy" @click="enable">Activar avisos</BaseButton>
      <p v-if="msg" class="mt-2 text-[13px] font-bold">{{ msg }}</p>
    </template>

    <template v-else>
      <h2 class="font-display text-[18px] font-extrabold leading-tight">Los avisos están bloqueados</h2>
      <p class="mt-1 text-[14px] font-medium leading-snug opacity-75">
        {{ phone.isIOS ? 'Ajustes → Notificaciones → Moccapp → Permitir.' : 'Toca el candado de la barra de direcciones → Notificaciones → Permitir.' }}
      </p>
    </template>
  </section>

  <!-- iPhone: no hay botón de instalar; se explica cómo -->
  <AnimatePresence>
    <motion.div
      v-if="iosSteps"
      class="fixed inset-0 z-[70] flex items-end bg-black/50"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :exit="{ opacity: 0 }"
      @click.self="iosSteps = false"
    >
      <motion.div
        class="w-full rounded-t-[28px] bg-bg p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        :initial="{ y: 300 }"
        :animate="{ y: 0 }"
        :exit="{ y: 300 }"
        :transition="{ type: 'spring', stiffness: 320, damping: 30 }"
      >
        <h2 class="font-display text-[22px] font-extrabold">Agregar a inicio en iPhone</h2>
        <ol class="mt-4 flex flex-col gap-3 text-[15px] font-medium">
          <li class="flex items-center gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line font-bold">1</span>
            Abre esta página en <b>Safari</b>.
          </li>
          <li class="flex items-center gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line font-bold">2</span>
            <span>Toca <PhExport class="inline align-[-3px] text-sky" :size="20" weight="bold" /> <b>Compartir</b> (abajo).</span>
          </li>
          <li class="flex items-center gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line font-bold">3</span>
            <span>Baja y toca <PhPlusSquare class="inline align-[-3px]" :size="20" weight="bold" /> <b>Agregar a inicio</b> → <b>Agregar</b>.</span>
          </li>
          <li class="flex items-center gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line font-bold">4</span>
            Abre Moccapp desde el ícono de Mocca y activa los avisos.
          </li>
        </ol>
        <BaseButton class="mt-6" size="lg" block @click="iosSteps = false">Entendido</BaseButton>
      </motion.div>
    </motion.div>
  </AnimatePresence>
</template>
