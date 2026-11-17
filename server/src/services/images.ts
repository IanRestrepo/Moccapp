// Imágenes para la guía: se buscan en Wikimedia Commons (libres, con autor y licencia) con las búsquedas que
// propone la IA para cada sección. Si no hay nada bueno o Commons no responde, la sección queda sin imagen.
import type { GuideImage } from '@vetquiz/shared'
import { z } from 'zod'
import { getLlm } from '../ai/gemini.js'

const API = 'https://commons.wikimedia.org/w/api.php'
// Wikimedia pide identificar la app en el User-Agent
const UA = 'Moccapp/1.0 (app de estudio personal)'
const OK_MIME = /^image\/(jpeg|png|gif|webp|svg\+xml)$/
const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

interface CommonsPage {
  title: string
  index?: number
  imageinfo?: {
    thumburl?: string
    thumbwidth?: number
    thumbheight?: number
    descriptionurl?: string
    mime?: string
    extmetadata?: Record<string, { value?: string }>
  }[]
}

/** Primera imagen útil de Commons para una búsqueda (o null) */
export async function searchCommons(query: string, fetchImpl: typeof fetch = fetch): Promise<Omit<GuideImage, 'caption'> | null> {
  const url = new URL(API)
  Object.entries({
    action: 'query',
    format: 'json',
    generator: 'search',
    // solo fotos y dibujos (sin PDFs ni libros escaneados)
    gsrsearch: `${query} filetype:bitmap|drawing`,
    gsrnamespace: '6',
    gsrlimit: '6',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '900',
    iiextmetadatafilter: 'LicenseShortName|Artist',
  }).forEach(([k, v]) => url.searchParams.set(k, v))
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const pages = Object.values(((await res.json()) as { query?: { pages?: Record<string, CommonsPage> } }).query?.pages ?? {})
    pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
    for (const p of pages) {
      const info = p.imageinfo?.[0]
      if (!info?.thumburl || !OK_MIME.test(info.mime ?? '')) continue
      // muy angostas o muy alargadas casi nunca son diagramas útiles
      const w = info.thumbwidth ?? 0
      const h = info.thumbheight ?? 0
      if (w < 200 || h < 150 || w / h > 4 || h / w > 3) continue
      const meta = info.extmetadata ?? {}
      return {
        url: info.thumburl,
        width: w,
        height: h,
        credit: stripHtml(meta.Artist?.value ?? '').slice(0, 120) || 'Wikimedia Commons',
        license: stripHtml(meta.LicenseShortName?.value ?? ''),
        link: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      }
    }
  } catch {
    /* sin imagen: no pasa nada */
  }
  return null
}

/** No quitar especie ni estructura al ampliar búsquedas: cambia el significado. */
export function broader(query: string): string[] { return [query.trim()].filter(Boolean) }

export const IMAGE_REVIEW_VERSION = 1
export const IMAGE_REVIEW_SYSTEM = `Revisa la imagen real como recurso educativo para la sección adjunta.
Aprueba solo si representa el tema y la especie que se estudia. En veterinaria/MVZ rechaza anatomía humana,
salvo que la sección enseñe explícitamente una comparación humana. No supongas equivalencia entre especies.
Todo rótulo visible debe estar en español o no haber rótulos; rechaza otros idiomas, texto ilegible o ambiguo.
No confíes en el pie de foto propuesto: inspecciona la imagen. Si no puedes verificar, rechaza.
Devuelve relevant, speciesMatch, spanishOrUnlabelled y caption (descripción fiel en español).`
const ImageReview = z.object({ relevant: z.boolean(), speciesMatch: z.boolean(), spanishOrUnlabelled: z.boolean(), caption: z.string().min(1) })

export async function verifyGuideImage(img: Omit<GuideImage, 'caption'>, context: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const url = new URL(img.url)
    if (url.protocol !== 'https:' || url.hostname !== 'upload.wikimedia.org') return null
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000), redirect: 'error' })
    const mime = res.headers.get('content-type')?.split(';')[0] ?? ''
    if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(mime)) return null
    const max = 4 * 1024 * 1024
    if (Number(res.headers.get('content-length')) > max || !res.body) return null
    const reader = res.body.getReader()
    const pieces: Uint8Array[] = []
    let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > max) { await reader.cancel(); return null }
      pieces.push(value)
    }
    const data = Buffer.concat(pieces)
    const raw = await getLlm().generateJson({ system: IMAGE_REVIEW_SYSTEM,
      source: [{ text: context }, { inlineData: { data: data.toString('base64'), mimeType: mime } }],
      prompt: 'Verifica esta imagen para esta sección. Ante duda, rechaza.', jsonSchema: z.toJSONSchema(ImageReview), temperature: 0, thinking: 'low' })
    const result = ImageReview.parse(raw)
    return result.relevant && result.speciesMatch && result.spanishOrUnlabelled ? result.caption : null
  } catch { return null }
}

/** Recupera candidatos y solo publica los aprobados visualmente para la sección. */
export async function findImages(
  sections: { images: { query: string; caption: string }[]; context?: string }[],
  fetchImpl: typeof fetch = fetch,
  verify = verifyGuideImage,
): Promise<GuideImage[][]> {
  const seen = new Set<string>()
  const out: GuideImage[][] = []
  for (const s of sections) {
    const images: GuideImage[] = []
    if (s.context) for (const q of s.images.slice(0, 2)) {
      const img = await searchCommons(q.query, fetchImpl)
      if (!img || seen.has(img.url)) continue
      const caption = await verify(img, s.context, fetchImpl)
      if (!caption) continue
      seen.add(img.url)
      images.push({ ...img, caption, verifiedVersion: IMAGE_REVIEW_VERSION })
    }
    out.push(images)
  }
  return out
}
