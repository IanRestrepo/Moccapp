/** Texto de la guía → HTML seguro: se escapa todo y solo **negrita** se vuelve <strong>. */
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export const richText = (s: string) => escape(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
/** Párrafos separados por línea en blanco */
export const paragraphs = (s: string) =>
  s
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
