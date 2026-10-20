// Almacenamiento de archivos subidos. Hoy disco local; la interfaz permite cambiar a S3/R2 sin tocar el resto.
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../env.js'

export interface Storage {
  save(buf: Buffer, ext: string): Promise<string>
  read(key: string): Promise<Buffer>
  remove(key: string): Promise<void>
  /** Ruta local (para la File API de Gemini, que sube desde una ruta) */
  localPath(key: string): string
}

const root = path.resolve(env.STORAGE_DIR)

export const storage: Storage = {
  async save(buf, ext) {
    const key = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`
    const file = this.localPath(key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, buf)
    return key
  },
  read(key) {
    return readFile(this.localPath(key))
  },
  async remove(key) {
    await rm(this.localPath(key), { force: true })
  },
  localPath(key) {
    const file = path.resolve(root, key)
    if (!file.startsWith(root + path.sep)) throw new Error('storage key inválida')
    return file
  },
}
