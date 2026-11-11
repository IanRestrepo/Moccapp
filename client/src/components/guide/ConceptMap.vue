<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { PhArrowsOut, PhArrowsIn, PhMinus, PhPlus } from '@phosphor-icons/vue'
import type { ConceptNode } from '@vetquiz/shared'
import ConceptTree, { type Tone } from '@/components/guide/ConceptTree.vue'

/**
 * Mapa conceptual de verdad: el tema central a la izquierda y los conceptos unidos por líneas con su frase de enlace
 * ("se divide en", "produce"…). Cada caja trae el dato que hay que saberse. Se mueve con el dedo y tiene zoom.
 */
const props = defineProps<{ center: string; centerFact?: string; branches: ConceptNode[] }>()

const TONES: Tone[] = [
  { solid: 'bg-lilac text-on-color', tint: 'bg-lilac-tint', line: 'var(--vq-lilac)' },
  { solid: 'bg-mint text-on-color', tint: 'bg-mint-tint', line: 'var(--vq-mint)' },
  { solid: 'bg-orange text-on-color', tint: 'bg-orange-tint', line: 'var(--vq-orange)' },
  { solid: 'bg-sky text-on-color', tint: 'bg-sky-tint', line: 'var(--vq-sky)' },
  { solid: 'bg-pink text-on-color', tint: 'bg-pink-tint', line: 'var(--vq-pink)' },
  { solid: 'bg-yellow text-on-color', tint: 'bg-yellow-tint', line: 'var(--vq-yellow)' },
]
const root = computed<ConceptNode>(() => ({ label: props.center, detail: props.centerFact, children: props.branches }))

// En el celular va en vertical (se lee a tamaño normal, sin arrastrar). En pantallas anchas o en pantalla completa,
// horizontal: el mapa entero de izquierda a derecha, con zoom.
const zoom = ref(0.85)
const full = ref(false)
const wide = ref(true)
onMounted(() => {
  wide.value = window.innerWidth >= 768
  if (!wide.value) zoom.value = 0.55
})
const horizontal = computed(() => wide.value || full.value)
const step = (d: number) => (zoom.value = Math.min(1.4, Math.max(0.35, Math.round((zoom.value + d) * 100) / 100)))
</script>

<template>
  <div :class="full ? 'fixed inset-0 z-[70] flex flex-col bg-bg p-3' : 'relative'">
    <div :class="['flex items-center gap-2', full ? 'mb-2' : 'mb-3']">
      <p class="flex-1 text-[13px] font-medium leading-snug text-ink-2">
        {{ horizontal ? 'Arrastra para moverte. Se lee de izquierda a derecha, siguiendo las flechas.' : 'Se lee de arriba abajo, siguiendo las flechas.' }}
      </p>
      <template v-if="horizontal">
        <button class="grid size-10 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Alejar" @click="step(-0.15)">
          <PhMinus :size="18" weight="bold" />
        </button>
        <button class="grid size-10 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line" aria-label="Acercar" @click="step(0.15)">
          <PhPlus :size="18" weight="bold" />
        </button>
      </template>
      <button
        :class="['flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-[13px] font-bold ring-1 ring-line']"
        :aria-label="full ? 'Salir de pantalla completa' : 'Ver el mapa completo en pantalla completa'"
        @click="full = !full"
      >
        <component :is="full ? PhArrowsIn : PhArrowsOut" :size="18" weight="bold" />
        {{ full ? 'Cerrar' : 'Mapa completo' }}
      </button>
    </div>

    <div v-if="horizontal" :class="['overflow-auto overscroll-contain rounded-[22px] bg-surface-2/60 ring-1 ring-line', full ? 'flex-1' : 'max-h-[72vh]']">
      <div class="w-max p-5" :style="{ zoom }">
        <ConceptTree :node="root" :level="0" :tone="TONES[0]!" :tones="TONES" />
      </div>
    </div>
    <div v-else class="cm-v">
      <ConceptTree :node="root" :level="0" :tone="TONES[0]!" :tones="TONES" />
    </div>
  </div>
</template>
