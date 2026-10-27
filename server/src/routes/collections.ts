import { Router } from 'express'
import { z } from 'zod'
import { CollectionInputSchema, SOURCE_COLORS } from '@vetquiz/shared'
import { Errors } from '../lib/errors.js'
import {
  addToCollection,
  createCollection,
  deleteCollection,
  listCollections,
  removeFromCollection,
  updateCollection,
} from '../services/collections.js'

export const collectionsRouter = Router()

const parseId = (raw: unknown, what = 'Esa carpeta') => {
  const r = z.string().uuid().safeParse(raw)
  if (!r.success) throw Errors.notFound(what)
  return r.data
}

collectionsRouter.get('/', async (_req, res) => {
  res.json({ collections: await listCollections() })
})

collectionsRouter.post('/', async (req, res) => {
  res.status(201).json({ collection: await createCollection(CollectionInputSchema.parse(req.body)) })
})

collectionsRouter.patch('/:id', async (req, res) => {
  const patch = z.object({ name: z.string().trim().min(1).max(60).optional(), color: z.enum(SOURCE_COLORS).optional() }).parse(req.body)
  res.json({ collection: await updateCollection(parseId(req.params.id), patch) })
})

collectionsRouter.delete('/:id', async (req, res) => {
  await deleteCollection(parseId(req.params.id))
  res.status(204).end()
})

collectionsRouter.post('/:id/sources', async (req, res) => {
  const { sourceIds } = z.object({ sourceIds: z.array(z.string().uuid()).min(1).max(100) }).parse(req.body)
  res.json({ collection: await addToCollection(parseId(req.params.id), sourceIds) })
})

collectionsRouter.delete('/:id/sources/:sourceId', async (req, res) => {
  res.json({ collection: await removeFromCollection(parseId(req.params.id), parseId(req.params.sourceId, 'Esa fuente')) })
})
