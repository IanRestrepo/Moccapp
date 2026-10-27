<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { motion } from 'motion-v'
import { PhBellRinging, PhChecks, PhClock, PhPaperPlaneTilt } from '@phosphor-icons/vue'
import { MOCCA_MESSAGE_MOODS, type AdminPersonDTO, type MoccaMessageMood, type SentMoccaMessageDTO } from '@vetquiz/shared'
import BaseButton from '@/components/ui/BaseButton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import MascotBlob from '@/components/mascot/MascotBlob.vue'
import { api, ApiRequestError } from '@/api/client'
import { LOVE_MESSAGES, QUICK_MESSAGES } from '@/lib/moccaMessages'
import { pressable } from '@/lib/motion'

/**
 * Mensajitos de Ian: escribe (o elige) qué dice Mocca, a quién y con qué cara.
 * Le sale en la app en ~15 s si está adentro; si no, cuando entre. Opcional: también al celular.
 */
const props = defineProps<{ people: AdminPersonDTO[]; viewLabel: (p: AdminPersonDTO) => string }>()
const emit = defineEmits<{ toast: [ok: boolean, text: string] }>()

const to = ref('ash')
const text = ref('')
const mood = ref<MoccaMessageMood>('happy')
const push = ref(false)
const moreIdeas = ref(false)
const confirming = ref(false)
const sending = ref(false)
const sent = ref<SentMoccaMessageDTO[]>([])

const MOOD_LABEL: Record<MoccaMessageMood, string> = { happy: 'Feliz', celebrating: 'Celebrando', proud: 'Orgullosa', amazed: 'Wow' }
const person = computed(() => props.people.find((p) => p.profile === to.value))
const nameOf = (profile: string) => props.people.find((p) => p.profile === profile)?.name.split(' ')[0] ?? profile

// lo que verá en el "¿seguro?": dónde está ella ahora
const whereNow = computed(() => {
  const p = person.value
  if (!p) return ''
  if (!p.online) return `${nameOf(p.profile)} no está en la app ahora: Mocca se lo dirá apenas entre.`
  if (p.view === 'exam') return `${nameOf(p.profile)} está haciendo un examen: le saldrá apenas lo termine, para no desconcentrarla.`
  return `${nameOf(p.profile)} está ${props.viewLabel(p)}: le sale en unos segundos.`
})

async function loadSent() {
  sent.value = await api.adminMessages().catch(() => sent.value)
}
let timer = 0
onMounted(() => {
  loadSent()
  // para ver cuándo le llega y cuándo lo ve
  timer = window.setInterval(loadSent, 10_000)
})
onBeforeUnmount(() => clearInterval(timer))

async function send() {
  confirming.value = false
  sending.value = true
  try {
    await api.sendMoccaMessage({ profile: to.value, text: text.value.trim(), mood: mood.value, push: push.value })
    emit('toast', true, `¡Enviado! Mocca se lo dice a ${nameOf(to.value)} 💌`)
    text.value = ''
    await loadSent()
  } catch (err) {
    emit('toast', false, err instanceof ApiRequestError ? err.message : 'No se pudo enviar.')
  } finally {
    sending.value = false
  }
}

const timeFmt = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })
const when = (iso: string) => {
  const d = new Date(iso)
  return new Date().toDateString() === d.toDateString() ? timeFmt.format(d) : `${dayFmt.format(d)} ${timeFmt.format(d)}`
}
</script>

<template>
  <section>
    <!-- redactor -->
    <div class="rounded-card bg-surface p-4 ring-1 ring-line">
      <div v-if="people.length > 1" class="flex items-center gap-2">
        <span class="text-[13px] font-bold text-ink-2">Para</span>
        <button
          v-for="p in people"
          :key="p.profile"
          :class="['flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-bold', to === p.profile ? 'bg-night text-white' : 'bg-surface-2']"
          @click="to = p.profile"
        >
          <span :class="['size-2 rounded-full', p.online ? 'bg-mint' : 'bg-ink-3/40']" />
          {{ p.name.split(' ')[0] }}
        </button>
      </div>

      <!-- vista previa: Mocca con su globo -->
      <div class="mb-4 mt-4 flex items-end gap-2">
        <MascotBlob :mood="mood" :size="78" class="shrink-0" />
        <div class="relative mb-6 min-h-[64px] flex-1 rounded-[20px] rounded-bl-none bg-lilac px-4 py-3 text-on-color">
          <span class="block text-[11.5px] font-extrabold uppercase tracking-wide opacity-70">💌 De Ian</span>
          <textarea
            v-model="text"
            rows="2"
            maxlength="160"
            placeholder="Escribe lo que Mocca le dirá…"
            class="mt-0.5 w-full resize-none bg-transparent font-display text-[17px] font-extrabold leading-snug placeholder:text-on-color/45 focus:outline-none"
            aria-label="Mensajito"
          />
          <span class="absolute bottom-1.5 right-3 text-[11px] font-bold opacity-50">{{ text.length }}/160</span>
        </div>
      </div>

      <!-- cara de Mocca -->
      <div class="flex gap-1.5" role="radiogroup" aria-label="Cara de Mocca">
        <button
          v-for="m in MOCCA_MESSAGE_MOODS"
          :key="m"
          role="radio"
          :aria-checked="mood === m"
          :class="['flex flex-1 flex-col items-center rounded-[14px] py-1.5 text-[11.5px] font-bold', mood === m ? 'bg-lilac-tint ring-2 ring-lilac' : 'bg-surface-2']"
          @click="mood = m"
        >
          <MascotBlob :mood="m" :size="34" />
          {{ MOOD_LABEL[m] }}
        </button>
      </div>

      <!-- atajos -->
      <p class="mt-4 text-[13px] font-bold text-ink-2">Atajos</p>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <motion.button
          v-for="q in moreIdeas ? [...QUICK_MESSAGES, ...LOVE_MESSAGES] : QUICK_MESSAGES"
          :key="q"
          v-bind="pressable"
          class="rounded-full bg-surface-2 px-3 py-1.5 text-left text-[13px] font-semibold"
          @click="text = q"
        >
          {{ q }}
        </motion.button>
        <button class="rounded-full px-3 py-1.5 text-[13px] font-bold text-lilac underline" @click="moreIdeas = !moreIdeas">
          {{ moreIdeas ? 'Menos' : 'Más ideas' }}
        </button>
      </div>

      <label class="mt-4 flex items-center gap-3 rounded-[16px] bg-surface-2 p-3">
        <input v-model="push" type="checkbox" class="size-5 accent-[var(--vq-lilac)]" />
        <PhBellRinging :size="20" weight="bold" class="shrink-0" />
        <span class="text-[13.5px] font-semibold leading-snug">También como notificación al celular <span class="text-ink-2">(si activó los avisos)</span></span>
      </label>

      <BaseButton class="mt-4" size="xl" block :disabled="!text.trim()" :loading="sending" @click="confirming = true">
        <PhPaperPlaneTilt :size="20" weight="fill" /> Enviar con Mocca
      </BaseButton>
    </div>

    <!-- enviados -->
    <h3 v-if="sent.length" class="mt-7 text-[19px] font-bold">Enviados</h3>
    <ul class="mt-3 flex flex-col gap-2">
      <li v-for="m in sent" :key="m.id" class="flex items-start gap-3 rounded-[18px] bg-surface p-3 ring-1 ring-line">
        <MascotBlob :mood="m.mood" :size="40" class="shrink-0" />
        <span class="min-w-0 flex-1">
          <span class="block text-[14.5px] font-bold leading-snug">{{ m.text }}</span>
          <span class="mt-0.5 block text-[12px] font-medium text-ink-2">Para {{ nameOf(m.profile) }} · {{ when(m.createdAt) }}</span>
        </span>
        <span
          :class="[
            'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold',
            m.seenAt ? 'bg-mint-tint text-success' : m.deliveredAt ? 'bg-sky-tint' : 'bg-surface-2 text-ink-2',
          ]"
        >
          <component :is="m.seenAt ? PhChecks : PhClock" :size="13" weight="bold" />
          {{ m.seenAt ? `Visto ${when(m.seenAt)}` : m.deliveredAt ? 'Le llegó' : 'Esperando' }}
        </span>
      </li>
    </ul>

    <ConfirmDialog
      :open="confirming"
      :title="`¿Seguro? Mocca le dirá: «${text.trim()}»`"
      :body="whereNow"
      confirm="Sí, ¡mándalo!"
      cancel="Todavía no"
      mood="happy"
      primary
      @confirm="send"
      @cancel="confirming = false"
    />
  </section>
</template>
