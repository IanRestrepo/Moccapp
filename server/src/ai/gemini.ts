// Cliente de Gemini (SDK oficial @google/genai). La API key solo vive aquí, en el backend.
import { ApiError, FileState, GoogleGenAI, type Part } from '@google/genai'
import { env } from '../env.js'
import { AppError, Errors } from '../lib/errors.js'

export type { Part }

export interface GenerateJsonParams {
  system: string
  /** Partes de la fuente (texto, inlineData, fileData) */
  source: Part[]
  prompt: string
  jsonSchema: unknown
  temperature: number
}

export interface UploadedFile {
  uri: string
  mimeType: string
  expiresAt: Date
}

/** Interfaz mínima para poder reemplazar Gemini por un doble en los tests. */
export interface Llm {
  generateJson(params: GenerateJsonParams): Promise<unknown>
  /** Ruta local o Blob (las partes de un PDF dividido se suben desde memoria) */
  uploadFile(file: string | Blob, mimeType: string, displayName: string): Promise<UploadedFile>
}

const VIDEO_HINTS = /youtube|video|private|unlisted|not available|unavailable|cannot be accessed|invalid.*uri/i

/** Traduce cualquier error del SDK a un AppError con mensaje amigable y si vale la pena reintentar. */
export function classifyGeminiError(err: unknown, isVideo = false): AppError {
  if (err instanceof AppError) return err
  const appErr = classify(err, isVideo)
  appErr.cause = err // para los logs: el mensaje crudo de Google
  return appErr
}

function classify(err: unknown, isVideo: boolean): AppError {
  if (err instanceof ApiError) {
    const { status, message } = err
    // 429 = cuota; 503 = "model is currently experiencing high demand" (saturación temporal de Google)
    if (status === 429 && /quota/i.test(message))
      return new AppError(
        429,
        'AI_QUOTA',
        'Se acabó la cuota de Gemini por hoy. Se reinicia en unas horas; para que no pase, activa la facturación de tu API key en Google AI Studio.',
        false,
      )
    if (status === 429 || status === 503) return Errors.aiBusy()
    if (status >= 500) return Errors.aiFailed()
    if (status === 401 || status === 403) {
      if (isVideo && VIDEO_HINTS.test(message)) return Errors.videoUnavailable()
      return Errors.aiConfig()
    }
    if (status === 404 && /model/i.test(message))
      return new AppError(500, 'AI_MODEL', `El modelo "${env.GEMINI_MODEL}" no existe. Revisa GEMINI_MODEL en .env.`)
    if (status === 400 && /api key/i.test(message)) return Errors.aiConfig()
    if (status === 400 && isVideo && VIDEO_HINTS.test(message)) return Errors.videoUnavailable()
    if (status === 400 && /too large|payload size|token count|exceeds/i.test(message))
      return new AppError(413, 'SOURCE_TOO_LARGE', 'La fuente es demasiado grande para procesarla de una vez. Divídela en partes.')
    return new AppError(502, 'AI_REJECTED', 'Gemini no pudo procesar esta fuente. Prueba con otro archivo.')
  }
  // red caída, timeout, DNS…
  return Errors.aiFailed()
}

// ── Respaldo de modelos ──────────────────────────────────────
// La cuota gratis de Gemini es POR MODELO: si "gemini-3.8-flash" se queda sin cuota del día o está saturado,
// se pasa de inmediato al siguiente modelo Flash en vez de fallar o esperar.

/** Modelos sin cuota y hasta cuándo (ms epoch): no se vuelven a intentar antes de esa hora */
const blockedUntil = new Map<string, number>()

const isQuotaError = (err: unknown) => err instanceof ApiError && err.status === 429
const isOverloaded = (err: unknown) => err instanceof ApiError && (err.status === 503 || err.status === 504 || err.status === 500)

/** "retryDelay": "80107s" del error de cuota → ms; si no viene, 1 h */
function retryDelayMs(err: unknown): number {
  const secs = Number(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(String((err as Error)?.message ?? ''))?.[1])
  return Number.isFinite(secs) && secs > 0 ? secs * 1000 : 3600_000
}

/**
 * Llama con el primer modelo disponible. Sin cuota (429) → ese modelo queda bloqueado hasta su reinicio y se
 * prueba el siguiente. Saturado (500/503/504) → se prueba el siguiente sin bloquearlo. Otros errores se lanzan.
 */
export async function withModelFallback<T>(
  models: string[],
  call: (model: string) => Promise<T>,
  now: () => number = Date.now,
): Promise<{ result: T; model: string }> {
  const candidates = models.filter((m) => (blockedUntil.get(m) ?? 0) <= now())
  // si todos están bloqueados, igual se intenta el principal (quizás ya se reinició)
  const order = candidates.length ? candidates : models.slice(0, 1)
  let lastErr: unknown
  for (const model of order) {
    try {
      return { result: await call(model), model }
    } catch (err) {
      lastErr = err
      if (isQuotaError(err)) {
        blockedUntil.set(model, now() + retryDelayMs(err))
        console.warn(`[gemini] ${model} sin cuota; pruebo el siguiente modelo`)
        continue
      }
      if (isOverloaded(err)) {
        console.warn(`[gemini] ${model} saturado (${(err as ApiError).status}); pruebo el siguiente modelo`)
        continue
      }
      throw err
    }
  }
  throw lastErr
}

/** Solo tests */
export const resetModelBlocks = () => blockedUntil.clear()

export function createGeminiLlm(): Llm {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })

  return {
    async generateJson({ system, source, prompt, jsonSchema, temperature }) {
      const isVideo = source.some((p) => p.fileData?.fileUri?.includes('youtube.com'))
      let res
      try {
        res = (
          await withModelFallback([env.GEMINI_MODEL, ...env.GEMINI_FALLBACK_MODELS], (model) =>
            ai.models.generateContent({
              model,
              contents: [{ role: 'user', parts: [...source, { text: prompt }] }],
              config: {
                systemInstruction: system,
                responseMimeType: 'application/json',
                responseJsonSchema: jsonSchema,
                temperature,
                maxOutputTokens: 32_768,
                httpOptions: { timeout: 240_000 },
              },
            }),
          )
        ).result
      } catch (err) {
        throw classifyGeminiError(err, isVideo)
      }

      if (res.promptFeedback?.blockReason)
        throw new AppError(422, 'AI_BLOCKED', 'Gemini no quiso procesar este contenido. Prueba con otra fuente.')
      const text = res.text
      if (!text) throw Errors.aiFailed()
      try {
        return JSON.parse(text)
      } catch {
        // típico cuando se corta por MAX_TOKENS: se reintenta
        throw new AppError(502, 'AI_BAD_JSON', Errors.aiFailed().message, true)
      }
    },

    async uploadFile(input, mimeType, displayName) {
      try {
        let file = await ai.files.upload({ file: input, config: { mimeType, displayName } })
        const started = Date.now()
        while (file.state === FileState.PROCESSING && Date.now() - started < 120_000) {
          await new Promise((r) => setTimeout(r, 2000))
          file = await ai.files.get({ name: file.name! })
        }
        if (file.state !== FileState.ACTIVE || !file.uri) throw Errors.aiFailed()
        return {
          uri: file.uri,
          mimeType: file.mimeType ?? mimeType,
          // caducan a las 48 h; se deja margen
          expiresAt: file.expirationTime ? new Date(file.expirationTime) : new Date(Date.now() + 46 * 3600_000),
        }
      } catch (err) {
        throw classifyGeminiError(err)
      }
    },
  }
}

let instance: Llm | null = null
export const getLlm = () => (instance ??= createGeminiLlm())
/** Solo tests */
export const setLlm = (llm: Llm) => {
  instance = llm
}
