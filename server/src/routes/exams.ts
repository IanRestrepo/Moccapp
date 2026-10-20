import { Router } from 'express'
import { z } from 'zod'
import { CreateExamSchema, SaveAnswerSchema, SubmitExamSchema } from '@vetquiz/shared'
import { Errors } from '../lib/errors.js'
import {
  createExam,
  createRepeat,
  createRetryFailed,
  getExamDTO,
  listHistory,
  regradeExam,
  saveAnswer,
  submitExam,
} from '../services/exams/index.js'

export const examsRouter = Router()

const Id = z.string().uuid()
const parseId = (raw: unknown, what = 'El examen') => {
  const r = Id.safeParse(raw)
  if (!r.success) throw Errors.notFound(what)
  return r.data
}

const HistoryQuery = z.object({
  sourceId: z.string().uuid().optional(),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

examsRouter.post('/', async (req, res) => {
  res.status(201).json(await createExam(CreateExamSchema.parse(req.body)))
})

examsRouter.get('/', async (req, res) => {
  res.json(await listHistory(HistoryQuery.parse(req.query)))
})

examsRouter.get('/:id', async (req, res) => {
  res.json({ exam: await getExamDTO(parseId(req.params.id)) })
})

examsRouter.put('/:id/answers/:questionId', async (req, res) => {
  const body = SaveAnswerSchema.parse(req.body)
  res.json(await saveAnswer(parseId(req.params.id), parseId(req.params.questionId, 'La pregunta'), body))
})

examsRouter.post('/:id/submit', async (req, res) => {
  const body = SubmitExamSchema.parse(req.body ?? {})
  res.json({ result: await submitExam(parseId(req.params.id), body) })
})

examsRouter.post('/:id/regrade', async (req, res) => {
  res.json({ result: await regradeExam(parseId(req.params.id)) })
})

examsRouter.post('/:id/retry-failed', async (req, res) => {
  res.status(201).json(await createRetryFailed(parseId(req.params.id)))
})

examsRouter.post('/:id/repeat', async (req, res) => {
  res.status(201).json(await createRepeat(parseId(req.params.id)))
})
