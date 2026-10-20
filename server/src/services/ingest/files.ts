import path from 'node:path'
import type { SourceFormat } from '@vetquiz/shared'
import { Errors } from '../../lib/errors.js'

export interface FileKind {
  format: Exclude<SourceFormat, 'youtube'>
  mimeType: string
  ext: string
  /** true = Gemini lo lee directo (PDF/imagen); false = se extrae el texto en el backend */
  native: boolean
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

const BY_EXT: Record<string, FileKind> = {
  '.pdf': { format: 'pdf', mimeType: 'application/pdf', ext: 'pdf', native: true },
  '.docx': { format: 'docx', mimeType: DOCX, ext: 'docx', native: false },
  '.pptx': { format: 'pptx', mimeType: PPTX, ext: 'pptx', native: false },
  '.jpg': { format: 'image', mimeType: 'image/jpeg', ext: 'jpg', native: true },
  '.jpeg': { format: 'image', mimeType: 'image/jpeg', ext: 'jpg', native: true },
  '.png': { format: 'image', mimeType: 'image/png', ext: 'png', native: true },
  '.webp': { format: 'image', mimeType: 'image/webp', ext: 'webp', native: true },
  '.heic': { format: 'image', mimeType: 'image/heic', ext: 'heic', native: true },
  '.heif': { format: 'image', mimeType: 'image/heif', ext: 'heif', native: true },
  '.txt': { format: 'text', mimeType: 'text/plain', ext: 'txt', native: false },
  '.md': { format: 'text', mimeType: 'text/plain', ext: 'txt', native: false },
}
const BY_MIME = new Map(Object.values(BY_EXT).map((k) => [k.mimeType, k]))

const isZip = (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b // "PK"

/**
 * Detecta el tipo por extensión o MIME y lo confirma con la firma de los bytes,
 * para no mandarle a Gemini algo que no es lo que dice ser. (.doc y .ppt viejos no se aceptan.)
 */
export function detectFileKind(originalName: string, mimeType: string, buf: Buffer): FileKind {
  const kind = BY_EXT[path.extname(originalName).toLowerCase()] ?? BY_MIME.get(mimeType)
  if (!kind) throw Errors.unsupportedFile()
  const ok =
    kind.format === 'pdf'
      ? buf.subarray(0, 5).toString('latin1') === '%PDF-'
      : kind.format === 'docx' || kind.format === 'pptx'
        ? isZip(buf)
        : kind.format === 'text'
          ? !buf.subarray(0, 4096).includes(0)
          : buf.length > 32
  if (!ok) throw Errors.unsupportedFile()
  return kind
}

export function formatFromMime(mimeType: string | null, kind: 'file' | 'text' | 'youtube'): SourceFormat {
  if (kind === 'youtube') return 'youtube'
  if (kind === 'text' || !mimeType) return 'text'
  return BY_MIME.get(mimeType)?.format ?? 'text'
}

/** Título inicial a partir del nombre del archivo: "Parcial_2-AINEs (1).pdf" → "Parcial 2 AINEs" */
export function titleFromFilename(name: string): string {
  const base = path
    .basename(name, path.extname(name))
    .replace(/\(\d+\)$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (base || 'Fuente sin título').slice(0, 120)
}
