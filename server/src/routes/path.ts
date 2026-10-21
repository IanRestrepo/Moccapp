import { Router } from 'express'
import { z } from 'zod'
import { PathCompleteSchema } from '@vetquiz/shared'
import { completeLesson, getLesson, getPath, openChest } from '../services/path.js'

export const pathRouter = Router()

const Key = z.string().regex(/^[0-9a-f-]{36}:(\d|chest)$/)

pathRouter.get('/', async (_req, res) => {
  res.json(await getPath())
})

pathRouter.get('/:key', async (req, res) => {
  res.json(await getLesson(Key.parse(req.params.key)))
})

pathRouter.post('/:key/complete', async (req, res) => {
  const { firstTry, total } = PathCompleteSchema.parse(req.body)
  res.json(await completeLesson(Key.parse(req.params.key), firstTry, total))
})

pathRouter.post('/:key/open', async (req, res) => {
  res.json(await openChest(Key.parse(req.params.key)))
})
