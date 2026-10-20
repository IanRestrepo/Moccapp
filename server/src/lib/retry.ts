import { AppError } from './errors.js'

export interface RetryOptions {
  /** Intentos adicionales después del primero */
  retries?: number
  /** Primer espera; luego ×3 (1 s → 3 s → 9 s) */
  baseMs?: number
  shouldRetry?: (err: unknown) => boolean
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void
}

const defaultShouldRetry = (err: unknown) => err instanceof AppError && err.retryable

/** Backoff exponencial con jitter. Solo reintenta errores marcados como retryable. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3
  const baseMs = opts.baseMs ?? Number(process.env.RETRY_BASE_MS ?? 1000)
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err
      const delay = baseMs * 3 ** attempt * (0.8 + Math.random() * 0.4)
      opts.onRetry?.(err, attempt + 1, delay)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}
