<script setup lang="ts">
import type { ConceptNode } from '@vetquiz/shared'

/**
 * Un nodo del mapa conceptual con sus hijos a la derecha. Las líneas salen del nodo, bajan por un tronco y
 * llegan a cada hijo pasando por su frase de enlace ("se divide en", "produce"…), como en un mapa conceptual.
 */
defineOptions({ name: 'ConceptTree' })
const props = defineProps<{
  node: ConceptNode
  /** 0 = tema central, 1 = concepto principal, 2 = subconcepto, 3 = específico */
  level: number
  /** color de la rama (lo hereda de su concepto principal) */
  tone: Tone
  /** en el tema central: un color por cada concepto principal */
  tones?: Tone[]
}>()
export interface Tone {
  solid: string
  tint: string
  /** color CSS de las líneas */
  line: string
}
const toneFor = (i: number) => (props.level === 0 && props.tones?.length ? props.tones[i % props.tones.length]! : props.tone)
</script>

<template>
  <div class="cm-row">
    <div
      :class="[
        'cm-node',
        level === 0 && 'cm-center bg-night text-white',
        level === 1 && tone.solid,
        level === 2 && tone.tint,
        level >= 3 && 'bg-surface ring-1 ring-line',
      ]"
    >
      <p :class="['font-display font-extrabold leading-tight', level === 0 ? 'text-[19px]' : level === 1 ? 'text-[16px]' : 'text-[14.5px]']">{{ node.label }}</p>
      <p v-if="node.detail" :class="['mt-1 leading-snug', level === 0 ? 'text-[13px] text-white/75' : level === 1 ? 'text-[12.5px] opacity-80' : 'text-[12.5px] text-ink-2']">
        {{ node.detail }}
      </p>
    </div>

    <div v-if="node.children?.length" class="cm-kids">
      <div v-for="(c, i) in node.children" :key="i" class="cm-kid" :style="{ '--cm-line': toneFor(i).line }">
        <span class="cm-link"><span>{{ c.link || 'incluye' }}</span></span>
        <ConceptTree :node="c" :level="level + 1" :tone="toneFor(i)" />
      </div>
    </div>
  </div>
</template>

<style>
/* sin scoped: el componente es recursivo y las líneas dependen de la estructura */
.cm-row {
  display: flex;
  align-items: center;
}
.cm-node {
  position: relative;
  flex: none;
  width: 190px;
  border-radius: 16px;
  padding: 10px 12px;
}
.cm-center {
  width: 200px;
  border-radius: 22px;
  padding: 14px 16px;
  text-align: center;
}
.cm-kids {
  position: relative;
  display: flex;
  flex-direction: column;
  margin-left: 18px;
}
/* línea del nodo a su tronco */
.cm-kids::before {
  content: '';
  position: absolute;
  left: -18px;
  top: 50%;
  width: 18px;
  border-top: 2px solid var(--cm-line, var(--vq-ink-3));
}
.cm-kid {
  position: relative;
  display: flex;
  align-items: center;
  padding: 5px 0;
}
/* tronco vertical: de la mitad del primer hijo a la mitad del último */
.cm-kid::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-left: 2px solid var(--cm-line, var(--vq-ink-3));
}
.cm-kid:first-child::before {
  top: 50%;
}
.cm-kid:last-child::before {
  bottom: 50%;
}
/* frase de enlace sobre la línea que va al hijo */
.cm-link {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  min-width: 34px;
  padding: 0 10px 0 8px;
}
.cm-link::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 2px solid var(--cm-line, var(--vq-ink-3));
}
/* punta de flecha */
.cm-link::after {
  content: '';
  position: absolute;
  right: -1px;
  top: 50%;
  width: 7px;
  height: 7px;
  border-top: 2px solid var(--cm-line, var(--vq-ink-3));
  border-right: 2px solid var(--cm-line, var(--vq-ink-3));
  transform: translateY(-50%) rotate(45deg);
}
.cm-link > span {
  position: relative;
  max-width: 96px;
  border-radius: 999px;
  background: var(--vq-bg, #111);
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
  font-style: italic;
  line-height: 1.15;
  text-align: center;
  color: var(--vq-ink-2, #999);
}

/* ── Vertical (celular): mismo mapa, pero los hijos van debajo y hacia la derecha; se lee a tamaño normal ── */
.cm-v .cm-row {
  display: block;
}
.cm-v .cm-node,
.cm-v .cm-center {
  width: auto;
}
.cm-v .cm-center {
  text-align: left;
}
.cm-v .cm-kids {
  display: block;
  margin-left: 16px;
}
.cm-v .cm-kids::before {
  display: none;
}
.cm-v .cm-kid {
  display: block;
  padding: 0 0 0 20px;
}
/* tronco: baja desde el padre; en el último hijo termina en su codo */
.cm-v .cm-kid::before,
.cm-v .cm-kid:first-child::before {
  top: 0;
  bottom: 0;
}
.cm-v .cm-kid:last-child::before {
  bottom: auto;
  height: 44px;
}
/* codo hacia la caja */
.cm-v .cm-kid::after {
  content: '';
  position: absolute;
  left: 0;
  top: 44px;
  width: 20px;
  border-top: 2px solid var(--cm-line, var(--vq-ink-3));
}
.cm-v .cm-link {
  display: block;
  min-width: 0;
  padding: 10px 0 4px;
}
.cm-v .cm-link::before,
.cm-v .cm-link::after {
  display: none;
}
.cm-v .cm-link > span {
  max-width: none;
  padding: 0;
  background: none;
  font-size: 12.5px;
  color: var(--cm-line, var(--vq-ink-2));
}
.cm-v .cm-link > span::after {
  content: ' ↓';
  font-style: normal;
}
</style>
