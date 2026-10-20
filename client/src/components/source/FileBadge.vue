<script setup lang="ts">
import { computed } from 'vue'
import type { SourceFormat } from '@vetquiz/shared'

/** Hojita tipo sticker con la etiqueta del formato (PDF rojo, PPT naranja, DOC azul…). */
const props = defineProps<{ format?: SourceFormat; name?: string; mime?: string }>()

const resolved = computed<SourceFormat>(() => {
  if (props.format) return props.format
  const n = props.name?.toLowerCase() ?? ''
  if (n.endsWith('.pdf')) return 'pdf'
  if (n.endsWith('.docx')) return 'docx'
  if (n.endsWith('.pptx')) return 'pptx'
  if (props.mime?.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/.test(n)) return 'image'
  return 'text'
})

const STYLE: Record<SourceFormat, { label: string; bg: string }> = {
  pdf: { label: 'PDF', bg: '#F2554B' },
  docx: { label: 'DOC', bg: '#4C8DFF' },
  pptx: { label: 'PPT', bg: '#FF8A3D' },
  image: { label: 'FOTO', bg: '#35B673' },
  text: { label: 'TXT', bg: '#8D6CE6' },
  youtube: { label: 'VIDEO', bg: '#FF3B30' },
}
</script>

<template>
  <span
    class="relative block h-[62px] w-[50px] shrink-0 rounded-[10px] border-[3px] border-[#16141C] bg-white"
    style="box-shadow: 0 0 0 2px #fff"
  >
    <!-- esquina doblada -->
    <span class="absolute -right-[3px] -top-[3px] size-4 rounded-bl-[6px] border-b-[3px] border-l-[3px] border-[#16141C] bg-[#E9E4DC]" />
    <span class="absolute inset-x-2 top-4 h-1 rounded bg-[#16141C]/15" />
    <span class="absolute left-2 right-4 top-6 h-1 rounded bg-[#16141C]/15" />
    <span
      class="absolute -left-1.5 bottom-2 rounded-md border-[2.5px] border-[#16141C] px-1 font-display text-[10px] font-extrabold leading-[14px] text-white"
      :style="{ background: STYLE[resolved].bg }"
    >
      {{ STYLE[resolved].label }}
    </span>
  </span>
</template>
