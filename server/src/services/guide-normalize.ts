/** Conserva letras griegas y cargas químicas: NAD+, NAD y NAD− no son equivalentes. */
export const normalizeGuide = (text: string): string => text.normalize('NFKC').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/−/g, '-')
  .replace(/[^\p{L}\p{N}+\-]/gu, ' ').replace(/\s+/g, ' ').trim()
