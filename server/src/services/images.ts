// Imágenes para la guía: se buscan en Wikimedia Commons (libres, con autor y licencia) con las búsquedas que
// propone la IA para cada sección. Si no hay nada bueno o Commons no responde, la sección queda sin imagen.
import type { GuideImage } from '@vetquiz/shared'

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

const GENERIC = /^(anatomy|anatomical|diagram|illustration|image|photo|picture|structure|overview|schematic|drawing)$/i
/** "dog extrinsic shoulder muscles anatomy" → [igual, sin palabras genéricas, y quitando palabras del final] (máx. 4) */
export function broader(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean)
  const core = words.filter((w) => !GENERIC.test(w))
  const out = [words.join(' '), core.join(' ')]
  for (let n = core.length - 1; n >= 2; n--) out.push(core.slice(0, n).join(' '))
  return [...new Set(out)].filter(Boolean).slice(0, 4)
}

/** Imágenes para cada sección; sin repetir la misma imagen en dos secciones */
export async function findImages(
  sections: { images: { query: string; caption: string }[] }[],
  fetchImpl: typeof fetch = fetch,
): Promise<GuideImage[][]> {
  const seen = new Set<string>()
  const out: GuideImage[][] = []
  // de a pocas para ser amables con Commons
  for (const s of sections) {
    const found = await Promise.all(
      s.images.slice(0, 2).map(async (q) => {
        let img = null
        // Commons exige todas las palabras: si no hay nada, se prueba cada vez más general
        for (const attempt of broader(q.query)) if ((img = await searchCommons(attempt, fetchImpl))) break
        return { q, img }
      }),
    )
    out.push(
      found.flatMap(({ q, img }) => {
        if (!img || seen.has(img.url)) return []
        seen.add(img.url)
        return [{ ...img, caption: q.caption }]
      }),
    )
  }
  return out
}
