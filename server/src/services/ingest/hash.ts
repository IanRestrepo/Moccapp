import { createHash } from 'node:crypto'
import { normalize } from '../../ai/schemas.js'

export const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex')

/** Texto pegado: mismo contenido con otros espacios o saltos de línea = misma fuente. */
export function normalizeText(text: string): string {
  return text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export const hashFile = (buf: Buffer) => `file:${sha256(buf)}`
export const hashText = (text: string) => `text:${sha256(normalizeText(text))}`
export const hashYoutube = (videoId: string) => `youtube:${videoId}`

/** Para detectar preguntas repetidas al ampliar el banco */
export const hashPrompt = (prompt: string) => sha256(normalize(prompt)).slice(0, 32)
