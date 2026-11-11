import { Router } from 'express'
import { z } from 'zod'
import { getGuide, retryGuide } from '../services/guide.js'
import { guideTopicQuiz } from '../services/path.js'

export const guideRouter = Router()
const Id = z.string().uuid()

/** La guía de una fuente; la primera vez la empieza a preparar (la app vuelve a preguntar hasta que esté) */
guideRouter.get('/:sourceId', async (req, res) => {
  res.json(await getGuide(Id.parse(req.params.sourceId)))
})

guideRouter.post('/:sourceId/retry', async (req, res) => {
  res.json(await retryGuide(Id.parse(req.params.sourceId)))
})

guideRouter.get('/:sourceId/topic/:index', async (req, res) => {
  res.json(await guideTopicQuiz(Id.parse(req.params.sourceId), z.coerce.number().int().min(0).max(40).parse(req.params.index)))
})
