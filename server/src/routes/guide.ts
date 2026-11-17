import { narrate } from '../services/narration.js'
import { getSource } from '../services/sources.js'
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

// Verifica el acceso a la fuente antes de generar audio.
guideRouter.post('/:sourceId/narration', async (req, res) => {
  await getSource(Id.parse(req.params.sourceId))
  const { text } = z.object({ text: z.string().trim().min(1).max(1200) }).parse(req.body)
  res.setHeader('Cache-Control', 'private, no-store')
  res.type('audio/wav').send(await narrate(text))
})
