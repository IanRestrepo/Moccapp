<script setup lang="ts">
import { ref } from 'vue'
import { motion } from 'motion-v'
import type { ConceptNode } from '@vetquiz/shared'
import { spring } from '@/lib/motion'

/**
 * Mapa conceptual hecho para el celular: el tema central arriba y un tronco del que salen las ramas.
 * Cada rama es una tarjeta de color con sus ideas; toca una idea para ver cómo se relaciona.
 */
defineProps<{ center: string; branches: ConceptNode[] }>()

const COLORS = [
  { card: 'bg-lilac-tint', dot: 'bg-lilac', line: 'border-lilac' },
  { card: 'bg-mint-tint', dot: 'bg-mint', line: 'border-mint' },
  { card: 'bg-orange-tint', dot: 'bg-orange', line: 'border-orange' },
  { card: 'bg-sky-tint', dot: 'bg-sky', line: 'border-sky' },
  { card: 'bg-pink-tint', dot: 'bg-pink', line: 'border-pink' },
  { card: 'bg-yellow-tint', dot: 'bg-yellow', line: 'border-yellow' },
]
const color = (i: number) => COLORS[i % COLORS.length]!
const open = ref(new Set<string>())
function toggle(id: string) {
  const s = new Set(open.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  open.value = s
}
</script>

<template>
  <div>
    <div class="flex justify-center">
      <p class="max-w-[90%] rounded-full bg-night px-5 py-3 text-center font-display text-[19px] font-extrabold leading-tight text-white shadow-float">
        {{ center }}
      </p>
    </div>

    <!-- tronco -->
    <ol class="relative ml-5 mt-0 border-l-[3px] border-dashed border-ink/15 pb-1 pt-5">
      <motion.li
        v-for="(b, i) in branches"
        :key="i"
        class="relative mb-5 pl-6 last:mb-0"
        :initial="{ opacity: 0, x: -16 }"
        :animate="{ opacity: 1, x: 0 }"
        :transition="{ ...spring.card, delay: i * 0.06 }"
      >
        <!-- rama: conector desde el tronco -->
        <span :class="['absolute -left-[3px] top-6 w-6 border-t-[3px]', color(i).line]" />
        <span :class="['absolute -left-[9px] top-[18px] size-[15px] rounded-full ring-4 ring-bg', color(i).dot]" />

        <section :class="['rounded-[22px] p-4', color(i).card]">
          <h3 class="font-display text-[18px] font-extrabold leading-tight">{{ b.label }}</h3>
          <p v-if="b.detail" class="mt-1 text-[13.5px] font-medium leading-snug text-ink-2">{{ b.detail }}</p>

          <ul v-if="b.children?.length" class="mt-3 flex flex-col gap-2">
            <li v-for="(c, j) in b.children" :key="j" class="rounded-[16px] bg-surface px-3 py-2.5 ring-1 ring-line">
              <p class="flex items-start gap-2">
                <span :class="['mt-[7px] size-2 shrink-0 rounded-full', color(i).dot]" />
                <span class="min-w-0 flex-1">
                  <span class="block text-[15px] font-bold leading-snug">{{ c.label }}</span>
                  <span v-if="c.detail" class="mt-0.5 block text-[13.5px] leading-snug text-ink-2">{{ c.detail }}</span>
                </span>
              </p>
              <!-- datos concretos: toca uno para ver su explicación -->
              <div v-if="c.children?.length" class="ml-4 mt-2 flex flex-wrap gap-1.5">
                <button
                  v-for="(d, k) in c.children"
                  :key="k"
                  type="button"
                  :class="['rounded-full px-2.5 py-1 text-left text-[12.5px] font-semibold leading-tight', color(i).card, d.detail && 'underline decoration-dotted underline-offset-2']"
                  :disabled="!d.detail"
                  :aria-expanded="open.has(`${i}-${j}-${k}`)"
                  @click="toggle(`${i}-${j}-${k}`)"
                >
                  {{ d.label }}
                </button>
              </div>
              <template v-for="(d, k) in c.children" :key="`x${k}`">
                <p v-if="open.has(`${i}-${j}-${k}`) && d.detail" class="ml-4 mt-1.5 text-[12.5px] leading-snug text-ink-2">
                  <b>{{ d.label }}:</b> {{ d.detail }}
                </p>
              </template>
            </li>
          </ul>
        </section>
      </motion.li>
    </ol>
  </div>
</template>
