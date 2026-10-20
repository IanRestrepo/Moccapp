<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import { PhCheck, PhQuotes, PhX } from '@phosphor-icons/vue'
import { QUESTION_TYPE_LABELS, type ReviewItemDTO } from '@vetquiz/shared'
import { spring } from '@/lib/motion'

/**
 * Revisión de una pregunta: qué respondió, cuál era la correcta, por qué la suya no,
 * por qué la correcta sí, y la cita de su fuente con la página.
 */
const props = defineProps<{ item: ReviewItemDTO }>()
const it = computed(() => props.item)

const status = computed(() => (it.value.credit >= 1 ? 'ok' : it.value.credit > 0 ? 'partial' : 'wrong'))
const strip = { ok: 'bg-mint', partial: 'bg-yellow', wrong: 'bg-pink' }
const label = { ok: 'Correcta', partial: 'Parcial', wrong: 'Incorrecta' }

const selected = computed(() =>
  it.value.answer && (it.value.answer.type === 'multiple_choice' || it.value.answer.type === 'true_false') ? it.value.answer.selectedIndex : null,
)
const textAnswer = computed(() => (it.value.answer?.type === 'short_answer' ? it.value.answer.text : null))
const matches = computed(() => (it.value.answer?.type === 'matching' ? it.value.answer.matches : null))
const unanswered = computed(() => it.value.feedback === 'No respondiste esta pregunta.')
</script>

<template>
  <motion.article
    class="overflow-hidden rounded-card bg-surface ring-1 ring-line"
    :initial="{ opacity: 0, y: 24 }"
    :while-in-view="status === 'ok' ? { opacity: 1, y: 0, scale: [0.97, 1.02, 1] } : { opacity: 1, y: 0, x: status === 'wrong' ? [0, -5, 5, -2, 0] : 0 }"
    :in-view-options="{ once: true, margin: '-40px' }"
    :transition="spring.card"
  >
    <div :class="['flex items-center justify-between px-5 py-2.5 text-on-color', strip[status]]">
      <span class="flex items-center gap-1.5 font-display text-[14px] font-bold">
        <component :is="status === 'wrong' ? PhX : PhCheck" :size="16" weight="bold" />
        {{ it.position + 1 }} · {{ label[status] }}
      </span>
      <span class="text-[12.5px] font-semibold opacity-75">{{ QUESTION_TYPE_LABELS[it.type] }}</span>
    </div>

    <div class="p-5">
      <p class="text-[12.5px] font-semibold text-ink-3">{{ it.topic }}</p>
      <h3 class="mt-1 font-display text-[18px] font-bold leading-snug tracking-[-0.01em]">{{ it.prompt }}</h3>

      <!-- MC / VF -->
      <ul v-if="it.data.type === 'multiple_choice' || it.data.type === 'true_false'" class="mt-4 flex flex-col gap-1.5">
        <li
          v-for="(opt, i) in it.data.options"
          :key="opt"
          :class="[
            'flex items-start gap-2.5 rounded-[16px] px-3 py-2.5 text-[14.5px] font-semibold leading-snug',
            i === it.data.correctIndex ? 'bg-mint-tint' : i === selected ? 'bg-pink-tint' : 'text-ink-2',
          ]"
        >
          <span
            :class="[
              'grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-extrabold',
              i === it.data.correctIndex ? 'bg-success text-white' : i === selected ? 'bg-danger text-white' : 'bg-surface-2',
            ]"
          >
            <PhCheck v-if="i === it.data.correctIndex" :size="13" weight="bold" />
            <PhX v-else-if="i === selected" :size="13" weight="bold" />
            <template v-else>{{ 'ABCDE'[i] }}</template>
          </span>
          <span class="flex-1">
            {{ opt }}
            <span v-if="i === selected" class="ml-1 text-[12px] font-bold text-ink-3">· tu respuesta</span>
          </span>
        </li>
      </ul>

      <!-- Emparejar -->
      <ul v-else-if="it.data.type === 'matching'" class="mt-4 flex flex-col gap-1.5">
        <li
          v-for="(p, i) in it.data.pairs"
          :key="p.left"
          :class="['rounded-[16px] px-3 py-2.5 text-[14px] leading-snug', matches?.[i] === i ? 'bg-mint-tint' : 'bg-pink-tint']"
        >
          <span class="font-bold">{{ p.left }}</span>
          <span class="font-semibold"> → {{ p.right }}</span>
          <span v-if="matches?.[i] !== i" class="mt-0.5 block text-[12.5px] font-semibold text-ink-2">
            Pusiste: {{ matches && matches[i]! >= 0 ? it.data.pairs[matches[i]!]!.right : 'nada' }}
          </span>
        </li>
      </ul>

      <!-- Abierta -->
      <div v-else-if="it.data.type === 'short_answer'" class="mt-4 space-y-2">
        <div class="rounded-[16px] bg-surface-2 px-4 py-3">
          <p class="text-[12px] font-bold text-ink-3">Tu respuesta</p>
          <p class="mt-0.5 text-[14.5px] font-medium leading-snug">{{ textAnswer?.trim() || '—' }}</p>
        </div>
        <div class="rounded-[16px] bg-mint-tint px-4 py-3">
          <p class="text-[12px] font-bold text-ink-3">Respuesta modelo</p>
          <p class="mt-0.5 text-[14.5px] font-semibold leading-snug">{{ it.data.expectedAnswer }}</p>
        </div>
      </div>

      <!-- Por qué la suya no / retroalimentación de la IA -->
      <p
        v-if="it.feedback && !unanswered && (status !== 'ok' || it.type === 'short_answer')"
        class="mt-4 rounded-[16px] bg-yellow-tint px-4 py-3 text-[14px] font-semibold leading-snug"
      >
        {{ it.feedback }}
      </p>

      <!-- Por qué la correcta es correcta -->
      <p class="mt-4 text-[14.5px] leading-relaxed text-ink">
        <span class="font-bold">Por qué: </span>{{ it.explanation }}
      </p>

      <!-- Cita de la fuente -->
      <blockquote class="mt-4 flex gap-3 rounded-[18px] bg-lilac-tint p-4">
        <PhQuotes :size="20" weight="fill" class="shrink-0 text-lilac" />
        <div>
          <p class="text-[14px] italic leading-snug">“{{ it.sourceQuote }}”</p>
          <p v-if="it.sourceLocation" class="mt-1.5 text-[12.5px] font-bold text-ink-2">{{ it.sourceLocation }}</p>
        </div>
      </blockquote>
    </div>
  </motion.article>
</template>
