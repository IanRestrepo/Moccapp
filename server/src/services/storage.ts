// Almacenamiento de archivos subidos: disco local (Mac, Docker) o Vercel Blob (en Vercel no hay disco).
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Response } from 'express'
import { env } from '../env.js'

export interface Storage {
  /** Guarda y devuelve la key (ruta relativa en disco o URL del Blob) */
  save(buf: Buffer, ext: string): Promise<string>
  read(key: string): Promise<Buffer>
  remove(key: string): Promise<void>
  /** Entrega el archivo original (ver el PDF, miniatura de fotos) */
  send(res: Response, key: string): void
}

const newKey = (ext: string) => `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`
const isUrl = (key: string) => /^https:\/\//.test(key)

const root = path.resolve(env.STORAGE_DIR)
function localPath(key: string) {
  const file = path.resolve(root, key)
  if (!file.startsWith(root + path.sep)) throw new Error('storage key inválida')
  return file
}

const disk: Storage = {
  async save(buf, ext) {
    const key = newKey(ext)
    const file = localPath(key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, buf)
    return key
  },
  read: (key) => readFile(localPath(key)),
  async remove(key) {
    await rm(localPath(key), { force: true })
  },
  send: (res, key) => res.sendFile(localPath(key)),
}

/** URL de un archivo de Vercel Blob: solo esas se leen (nada de URLs arbitrarias) */
export const isBlobUrl = (url: string) => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname.endsWith('.blob.vercel-storage.com')
  } catch {
    return false
  }
}

async function fetchBlob(url: string): Promise<Buffer> {
  if (!isBlobUrl(url)) throw new Error('URL de Blob inválida')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Blob ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const blob: Storage = {
  async save(buf, ext) {
    const { put } = await import('@vercel/blob')
    const r = await put(`uploads/${newKey(ext)}`, buf, { access: 'public', addRandomSuffix: true })
    return r.url
  },
  // archivos subidos antes de la mudanza (si alguno quedó en disco) siguen funcionando en local
  read: (key) => (isUrl(key) ? fetchBlob(key) : disk.read(key)),
  async remove(key) {
    if (!isUrl(key)) return disk.remove(key)
    const { del } = await import('@vercel/blob')
    await del(key)
  },
  send: (res, key) => (isUrl(key) ? res.redirect(key) : disk.send(res, key)),
}

export const usesBlob = () => !!env.BLOB_READ_WRITE_TOKEN
export const storage: Storage = usesBlob() ? blob : disk
export { fetchBlob }
