// Extracción de texto de DOCX y PPTX. Gemini no los lee nativo, así que se manda el texto.
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { Errors } from '../../lib/errors.js'
import { normalizeText } from './hash.js'

export async function extractDocx(buf: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: buf })
  const text = normalizeText(value)
  if (text.length < 50) throw Errors.emptyDocument()
  return text
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodeXml = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return XML_ENTITIES[e] ?? m
  })

/** Texto de una diapositiva: un párrafo (<a:p>) por línea, con sus fragmentos (<a:t>) unidos. */
function slideText(xml: string): string {
  return xml
    .split(/<\/a:p>/)
    .map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1] ?? '')).join(''))
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

const slideNumber = (name: string) => Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0)

/**
 * "Diapositiva N:" antes de cada una, para que Gemini pueda citar la ubicación.
 * Incluye las notas del orador si existen (los profes suelen poner ahí la explicación).
 */
export async function extractPptx(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNumber(a) - slideNumber(b))

  const parts: string[] = []
  for (const name of slides) {
    const n = slideNumber(name)
    const body = slideText(await zip.file(name)!.async('string'))
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`)
    // las notas traen el número de diapositiva como texto suelto; se descarta si es solo un número
    const notes = notesFile ? slideText(await notesFile.async('string')).replace(/^\d+$/gm, '').trim() : ''
    if (!body && !notes) continue
    parts.push(`Diapositiva ${n}:\n${body}${notes ? `\nNotas: ${notes}` : ''}`)
  }

  const text = normalizeText(parts.join('\n\n'))
  if (text.length < 50) throw Errors.emptyDocument()
  return text
}
