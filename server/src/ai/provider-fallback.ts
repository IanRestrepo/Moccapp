import type { Llm } from './gemini.js'
import { AppError } from '../lib/errors.js'

const unavailable = new Set(['AI_QUOTA', 'AI_CREDITS_EXHAUSTED', 'AI_BUSY', 'AI_FAILED', 'AI_CONFIG', 'AI_MODEL'])
/** Breaker local a la instancia; vuelve a probar Gemini después del plazo. */
export function withProviderFallback(primary: Llm, backup: Llm, now = Date.now): Llm {
  let blockedUntil = 0
  let lastError: unknown
  return {
    uploadFile: (...args) => primary.uploadFile(...args),
    async generateJson(params) {
      if (now() >= blockedUntil) {
        try { return await primary.generateJson(params) }
        catch (err) {
          if (!(err instanceof AppError) || !unavailable.has(err.code)) throw err
          lastError = err
          blockedUntil = now() + (['AI_CREDITS_EXHAUSTED', 'AI_CONFIG', 'AI_MODEL'].includes(err.code) ? 300_000 : 60_000)
          console.warn(`[ai] Gemini no disponible (${err.code}); usando respaldo`)
        }
      }
      try { return await backup.generateJson(params) }
      catch (err) {
        if (err instanceof AppError && err.code === 'AI_FALLBACK_UNSUPPORTED') throw lastError
        throw err
      }
    },
  }
}
