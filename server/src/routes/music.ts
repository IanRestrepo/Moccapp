// Música de la escena del examen perfecto. El archivo NO va en el repositorio (que es público): vive en el
// almacenamiento de la app (Vercel Blob en producción, la carpeta de archivos en local) y solo se entrega a quien
// entró con su código. Si no hay ninguno, la app usa su sonido de siempre.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { env } from '../env.js'

export const musicRouter = Router()

/** En Blob: el archivo más reciente con este prefijo. En local: <STORAGE_DIR>/musica/escena-perfecta.m4a */
const PREFIX = 'musica/escena-perfecta'
const localFile = path.resolve(env.STORAGE_DIR, 'musica', 'escena-perfecta.m4a')

let cached: { url: string | null; at: number } | null = null
async function blobUrl(): Promise<string | null> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.url
  const { list } = await import('@vercel/blob')
  const { blobs } = await list({ prefix: PREFIX, token: env.BLOB_READ_WRITE_TOKEN })
  const newest = blobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0]
  cached = { url: newest?.url ?? null, at: Date.now() }
  return cached.url
}

musicRouter.get('/', async (_req, res) => {
  const url = env.BLOB_READ_WRITE_TOKEN ? await blobUrl().catch(() => null) : existsSync(localFile) ? '/api/scene-music/file' : null
  res.json({ url })
})

musicRouter.get('/file', (_req, res) => {
  if (!existsSync(localFile)) return void res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Sin música.' } })
  res.type('audio/mp4').sendFile(localFile)
})
