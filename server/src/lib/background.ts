// Trabajo que sigue después de responder (generar preguntas). En un servidor normal basta no esperarlo;
// en Vercel la función se congela al responder, así que se le avisa con waitUntil (hasta maxDuration).
import { waitUntil } from '@vercel/functions'

export function background(job: Promise<unknown>): void {
  const safe = job.catch(() => {}) // los errores ya se registran donde corresponde
  if (process.env.VERCEL) waitUntil(safe)
}
