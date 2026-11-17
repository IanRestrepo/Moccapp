import { createHash } from 'node:crypto'
import type { Llm, Part } from './gemini.js'
import { AppError } from '../lib/errors.js'
import { generationSchema } from './response-schema.js'

interface Config { token: string; accountId: string; model: string }
export function createCloudflareLlm(config: Config, fetchImpl: typeof fetch = fetch): Llm {
  const base = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai`
  let blockedUntil = 0
  const documents = new Map<string, Promise<string>>()
  async function call(path: string, body: string | FormData): Promise<any> {
    if (Date.now() < blockedUntil) throw new AppError(429, 'AI_BACKUP_QUOTA', 'El respaldo también alcanzó su límite. Puedes seguir estudiando el material guardado.', false)
    let res: Response
    try {
      res = await fetchImpl(base + path, { method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}) },
        body, signal: AbortSignal.timeout(90_000), redirect: 'error' })
    } catch { throw new AppError(503, 'AI_BACKUP_UNAVAILABLE', 'El respaldo no respondió a tiempo. El material guardado sigue disponible.', false) }
    if (res.status === 429 || res.status === 402) {
      const delay = Number(res.headers.get('retry-after'))
      blockedUntil = Date.now() + (Number.isFinite(delay) && delay > 0 ? delay * 1000 : 60_000)
      throw new AppError(429, 'AI_BACKUP_QUOTA', 'El respaldo también alcanzó su límite. Puedes seguir estudiando el material guardado.', false)
    }
    if (res.status === 401 || res.status === 403) throw new AppError(503, 'AI_BACKUP_CONFIG', 'No se pudo acceder al respaldo de IA. Revisa su configuración en el servidor.')
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.success) throw new AppError(502, 'AI_BACKUP_FAILED', 'El respaldo no pudo completar esta generación. El material guardado sigue disponible.', false)
    return data.result
  }
  async function sourceText(parts: Part[]): Promise<string> {
    // No convertir imágenes a texto para aparentar una inspección visual: fallar cerrado.
    if (parts.some(p => p.fileData || (p.inlineData && p.inlineData.mimeType !== 'application/pdf'))) {
      throw new AppError(422, 'AI_FALLBACK_UNSUPPORTED', 'Esta fuente requiere el proveedor original.')
    }
    const texts: string[] = []
    for (const part of parts) {
      if (part.text) texts.push(part.text)
      if (part.inlineData?.data) {
        const data = part.inlineData.data
        const key = createHash('sha256').update(data).digest('hex')
        let pending = documents.get(key)
        if (!pending) {
          pending = (async () => {
            const form = new FormData()
            form.append('files', new Blob([Buffer.from(data, 'base64')], { type: 'application/pdf' }), 'fuente.pdf')
            const result = await call('/tomarkdown', form)
            const doc = result?.[0]
            if (doc?.format !== 'markdown' || !doc.data?.trim()) throw new AppError(422, 'AI_DOCUMENT_UNREADABLE', 'No se pudo extraer el texto del PDF para el respaldo.')
            return doc.data as string
          })()
          if (documents.size >= 4) documents.delete(documents.keys().next().value!)
          documents.set(key, pending)
          pending.catch(() => documents.delete(key))
        }
        texts.push(await pending)
      }
    }
    return texts.join('\n\n')
  }
  return {
    async uploadFile() { throw new AppError(422, 'AI_FALLBACK_UNSUPPORTED', 'El respaldo no usa archivos de Gemini.') },
    async generateJson(p) {
      const text = await sourceText(p.source)
      // No recortar silenciosamente un documento: perdería temas que deben estudiarse.
      if (text.length + p.system.length + p.prompt.length + JSON.stringify(p.jsonSchema).length > 45_000)
        throw new AppError(413, 'AI_BACKUP_CONTEXT', 'Esta fuente es demasiado extensa para el respaldo. Divídela por capítulos para generar contenido nuevo.')
      const result = await call(`/run/${config.model}`, JSON.stringify({
        messages: [{ role: 'system', content: p.system }, { role: 'user', content: `${text}\n\n${p.prompt}` }],
        temperature: p.temperature, max_tokens: 8192,
        response_format: { type: 'json_schema', json_schema: generationSchema(p.jsonSchema) },
      }))
      if (result?.usage) console.info('[cloudflare] uso', JSON.stringify(result.usage))
      const output = result?.response
      if (output && typeof output === 'object') return output
      try { if (typeof output === 'string') return JSON.parse(output) } catch { /* validar abajo */ }
      throw new AppError(502, 'AI_BACKUP_BAD_JSON', 'El respaldo devolvió una respuesta incompleta. Intenta nuevamente.', false)
    },
  }
}
