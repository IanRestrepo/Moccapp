import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { CreateTextSourceSchema, CreateYoutubeSourceSchema, SOURCE_COLORS } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { sources } from '../db/schema.js'
import { env } from '../env.js'
import { Errors } from '../lib/errors.js'
import {
  createFileSource,
  createTextSource,
  createYoutubeSource,
  deleteSource,
  getSource,
  getSourceDTO,
  listSourceDTOs,
  retrySource,
  type CreateResult,
} from '../services/sources.js'
import { storage } from '../services/storage.js'
import { eq } from 'drizzle-orm'

export const sourcesRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024, files: 1 },
})

const JsonSourceSchema = z.discriminatedUnion('kind', [CreateTextSourceSchema, CreateYoutubeSourceSchema])
const IdSchema = z.string().uuid()
const PatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  color: z.enum(SOURCE_COLORS).optional(),
})

function parseId(raw: unknown): string {
  const r = IdSchema.safeParse(raw)
  if (!r.success) throw Errors.notFound('La fuente')
  return r.data
}

/** multer decodifica el nombre como latin1; los nombres con tildes llegan dañados ("FisiologÃ­a") */
const fixFilename = (name: string) => {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8')
  return utf8.includes('�') ? name : utf8
}

async function respondCreated(res: import('express').Response, result: CreateResult) {
  res.status(result.deduplicated ? 200 : 202).json({
    source: await getSourceDTO(result.source.id),
    deduplicated: result.deduplicated,
  })
}

// POST /api/sources — archivo (multipart) o JSON (texto / YouTube)
sourcesRouter.post('/', upload.single('file'), async (req, res) => {
  if (req.file) {
    const title = z.string().trim().min(1).max(120).optional().parse(req.body?.title || undefined)
    const result = await createFileSource({ ...req.file, originalname: fixFilename(req.file.originalname) }, title)
    return respondCreated(res, result)
  }
  const body = JsonSourceSchema.parse(req.body)
  const result =
    body.kind === 'text' ? await createTextSource(body.text, body.title) : await createYoutubeSource(body.url, body.title)
  return respondCreated(res, result)
})

sourcesRouter.get('/', async (_req, res) => {
  res.json({ sources: await listSourceDTOs() })
})

sourcesRouter.get('/:id', async (req, res) => {
  res.json({ source: await getSourceDTO(parseId(req.params.id)) })
})

sourcesRouter.post('/:id/retry', async (req, res) => {
  const source = await retrySource(parseId(req.params.id))
  res.status(202).json({ source: await getSourceDTO(source.id) })
})

sourcesRouter.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id)
  const patch = PatchSchema.parse(req.body)
  await getSource(id)
  if (patch.title || patch.color) {
    await db
      .update(sources)
      .set({ ...patch, ...(patch.title ? { titleLocked: true } : {}), updatedAt: new Date() })
      .where(eq(sources.id, id))
  }
  res.json({ source: await getSourceDTO(id) })
})

sourcesRouter.delete('/:id', async (req, res) => {
  await deleteSource(parseId(req.params.id))
  res.status(204).end()
})

// Archivo original (miniatura de fotos, ver el PDF)
sourcesRouter.get('/:id/file', async (req, res) => {
  const source = await getSource(parseId(req.params.id))
  if (!source.storageKey || !source.mimeType) throw Errors.notFound('El archivo')
  res.setHeader('Content-Type', source.mimeType)
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  res.sendFile(storage.localPath(source.storageKey))
})
