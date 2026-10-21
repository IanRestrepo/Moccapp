// Subida directa a Vercel Blob: Vercel no deja pasar más de 4,5 MB por una función, y las presentaciones
// pesan 10–25 MB. El celular pide aquí un permiso de un solo uso y sube el archivo directo al Blob.
import { Router } from 'express'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { env } from '../env.js'
import { profileOf } from '../lib/access.js'
import { AppError } from '../lib/errors.js'

export const uploadsRouter = Router()

const ALLOWED = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
  'image/*',
]

// Va antes del candado general: el aviso de "subida terminada" lo manda Vercel (firmado), no el celular.
uploadsRouter.post('/blob', async (req, res) => {
  if (!env.BLOB_READ_WRITE_TOKEN) throw new AppError(404, 'NOT_FOUND', 'Ruta no encontrada.')
  const result = await handleUpload({
    body: req.body as HandleUploadBody,
    request: req,
    onBeforeGenerateToken: async () => {
      if (!profileOf(req)) throw new AppError(401, 'ACCESS_REQUIRED', 'Escribe tu código de acceso para entrar.')
      return { allowedContentTypes: ALLOWED, maximumSizeInBytes: env.UPLOAD_MAX_MB * 1024 * 1024, addRandomSuffix: true }
    },
    onUploadCompleted: async () => {
      // nada: la app registra la fuente con POST /api/sources apenas termina la subida
    },
  })
  res.json(result)
})
