<script setup lang="ts">
import { ref } from 'vue'
import { PhLightbulbFilament, PhCheckCircle, PhX } from '@phosphor-icons/vue'
import type { GuideSection } from '@vetquiz/shared'
import { paragraphs, richText } from '@/lib/richText'

/** Una sección de la guía: explicación, lo que no puede faltar, términos, tablas y truco */
defineProps<{ section: GuideSection; tint: string }>()
/** Imagen abierta en grande (para ver los detalles de un diagrama) */
const zoomed = ref<GuideSection['images'][number] | null>(null)
const broken = ref(new Set<string>())
</script>

<template>
  <div class="guide-section text-[16px] leading-[1.65]">
    <!-- eslint-disable-next-line vue/no-v-html -- richText escapa todo y solo deja <strong> -->
    <p v-for="(p, i) in paragraphs(section.summary)" :key="i" class="mt-3 first:mt-0" v-html="richText(p)" />

    <figure v-for="img in section.images.filter((i) => !broken.has(i.url))" :key="img.url" class="mt-5">
      <button type="button" class="block w-full overflow-hidden rounded-[20px] bg-white ring-1 ring-line" :aria-label="`Ver en grande: ${img.caption}`" @click="zoomed = img">
        <img
          :src="img.url"
          :alt="img.caption"
          :width="img.width"
          :height="img.height"
          loading="lazy"
          class="max-h-[340px] w-full object-contain"
          @error="broken = new Set([...broken, img.url])"
        />
      </button>
      <figcaption class="mt-1.5 px-1 text-[13.5px] font-semibold leading-snug">
        {{ img.caption }}
        <a :href="img.link" target="_blank" rel="noopener" class="block text-[11px] font-medium text-ink-3 underline">
          Imagen: {{ img.credit }}{{ img.license ? ` · ${img.license}` : '' }} · Wikimedia Commons
        </a>
      </figcaption>
    </figure>

    <div v-if="section.keyPoints.length" class="mt-5 rounded-[20px] bg-surface p-4 ring-1 ring-line">
      <p class="text-[12.5px] font-extrabold uppercase tracking-wide text-ink-2">No puede faltar</p>
      <ul class="mt-2 flex flex-col gap-2">
        <li v-for="(k, i) in section.keyPoints" :key="i" class="flex gap-2 text-[15px] leading-snug">
          <PhCheckCircle :size="20" weight="fill" class="mt-px shrink-0 text-success" />
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span v-html="richText(k)" />
        </li>
      </ul>
    </div>

    <div v-if="section.terms.length" class="mt-4">
      <p class="text-[12.5px] font-extrabold uppercase tracking-wide text-ink-2">Términos</p>
      <dl class="mt-2 flex flex-col gap-2">
        <div v-for="t in section.terms" :key="t.term" :class="['rounded-[16px] px-4 py-3', tint]">
          <dt class="font-display text-[15.5px] font-extrabold leading-tight">{{ t.term }}</dt>
          <dd class="mt-0.5 text-[14.5px] leading-snug">{{ t.definition }}</dd>
        </div>
      </dl>
    </div>

    <div v-for="(tb, i) in section.tables" :key="i" class="mt-4">
      <p class="text-[12.5px] font-extrabold uppercase tracking-wide text-ink-2">{{ tb.title || 'Comparación' }}</p>
      <div class="-mx-1 mt-2 overflow-x-auto px-1">
        <table class="w-full min-w-[420px] border-separate border-spacing-0 overflow-hidden rounded-[16px] text-left text-[13.5px] leading-snug ring-1 ring-line">
          <thead>
            <tr>
              <th v-for="c in tb.columns" :key="c" :class="['px-3 py-2 font-extrabold', tint]">{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in tb.rows" :key="r" class="odd:bg-surface even:bg-surface-2">
              <td v-for="(cell, c) in row" :key="c" :class="['border-t border-line px-3 py-2 align-top', c === 0 && 'font-bold']">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p v-if="section.tip" class="mt-4 flex gap-2.5 rounded-[18px] bg-yellow-tint px-4 py-3 text-[14.5px] font-semibold leading-snug">
      <PhLightbulbFilament :size="22" weight="fill" class="shrink-0 text-yellow" />
      <span>{{ section.tip }}</span>
    </p>

    <!-- imagen en grande -->
    <Teleport to="body">
      <div v-if="zoomed" class="fixed inset-0 z-[80] flex flex-col bg-black/90 p-3" role="dialog" aria-modal="true" @click.self="zoomed = null">
        <button class="ml-auto grid size-11 place-items-center rounded-full bg-white/15 text-white" aria-label="Cerrar" @click="zoomed = null">
          <PhX :size="22" weight="bold" />
        </button>
        <div class="flex flex-1 items-center justify-center overflow-auto" @click.self="zoomed = null">
          <img :src="zoomed.url" :alt="zoomed.caption" class="max-h-full max-w-full rounded-[12px] bg-white object-contain" />
        </div>
        <p class="px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-center text-[14px] font-semibold text-white">{{ zoomed.caption }}</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.guide-section :deep(strong) {
  font-weight: 800;
}
</style>
