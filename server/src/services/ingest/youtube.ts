import { Errors } from '../../lib/errors.js'

export { parseYoutubeId } from '@vetquiz/shared'

export const canonicalYoutubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`

export interface YoutubeMeta {
  title: string | null
  thumbnailUrl: string
}

/**
 * Título y miniatura con oEmbed (sin API key). Un video privado o borrado responde 401/403/404:
 * así se avisa ANTES de gastar una llamada a Gemini. Si oEmbed falla por red, se sigue igual.
 */
export async function fetchYoutubeMeta(id: string, fetchImpl: typeof fetch = fetch): Promise<YoutubeMeta> {
  const fallback = { title: null, thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
  let res: Response
  try {
    res = await fetchImpl(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalYoutubeUrl(id))}`,
      { signal: AbortSignal.timeout(5000) },
    )
  } catch {
    return fallback
  }
  if ([401, 403, 404].includes(res.status)) throw Errors.videoUnavailable()
  if (!res.ok) return fallback
  const data = (await res.json().catch(() => ({}))) as { title?: string }
  return { title: data.title?.slice(0, 120) ?? null, thumbnailUrl: fallback.thumbnailUrl }
}
