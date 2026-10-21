import { Router } from 'express'
import { z } from 'zod'
import { getStudyDeck } from '../services/study.js'

export const studyRouter = Router()

const Query = z.object({
  sources: z
    .string()
    .transform((s) => [...new Set(s.split(',').filter(Boolean))])
    .pipe(z.array(z.string().uuid()).min(1).max(12)),
})

studyRouter.get('/', async (req, res) => {
  res.json(await getStudyDeck(Query.parse(req.query).sources))
})
