// Gemini acepta PDFs de hasta 50 MB. Los PDF de láminas (anatomía, histología) suelen pesar más,
// así que se dividen en partes por rango de páginas y se mandan juntas en la misma petición.
import { PDFDocument } from 'pdf-lib'
import { AppError } from '../../lib/errors.js'

export interface PdfChunk {
  bytes: Uint8Array
  /** Páginas del PDF ORIGINAL (1-based, inclusivo) para que las citas digan la página correcta */
  fromPage: number
  toPage: number
}

export async function splitPdf(buf: Buffer, maxBytes: number): Promise<PdfChunk[]> {
  const src = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false })
  const total = src.getPageCount()
  const chunks: PdfChunk[] = []

  async function build(from: number, to: number) {
    const out = await PDFDocument.create()
    const pages = await out.copyPages(src, Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i))
    pages.forEach((p) => out.addPage(p))
    const bytes = await out.save()
    if (bytes.length <= maxBytes) return chunks.push({ bytes, fromPage: from, toPage: to })
    if (from === to)
      throw new AppError(413, 'SOURCE_TOO_LARGE', `La página ${from} del PDF pesa demasiado para procesarla. Exporta el PDF con menor calidad.`)
    // la parte quedó grande (páginas con más imágenes): se parte a la mitad
    const mid = Math.floor((from + to) / 2)
    await build(from, mid)
    await build(mid + 1, to)
  }

  // Primer corte en rangos parejos según el peso; luego se ajusta recursivamente
  const n = Math.min(total, Math.ceil(buf.length / (maxBytes * 0.85)))
  const size = Math.ceil(total / n)
  for (let from = 1; from <= total; from += size) await build(from, Math.min(total, from + size - 1))
  return chunks
}
