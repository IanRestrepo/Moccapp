import { Router } from 'express'
import { z } from 'zod'
import { ConnectCalendarSchema, ManualExamSchema, UpdateExamSchema } from '@vetquiz/shared'
import { addManualExam, connectCalendar, deleteExam, disconnectCalendar, getCalendar, setDailyFacts, syncCalendar, updateExam } from '../services/calendar.js'

export const calendarRouter = Router()
const Id = z.string().uuid()

calendarRouter.get('/', async (_req, res) => {
  res.json(await getCalendar())
})

/** Conectar (o cambiar) el enlace iCal del calendario de la U */
calendarRouter.put('/feed', async (req, res) => {
  res.json(await connectCalendar(ConnectCalendarSchema.parse(req.body).url))
})

calendarRouter.delete('/feed', async (_req, res) => {
  res.json(await disconnectCalendar())
})

/** Leerlo ya (botón "Actualizar") */
calendarRouter.post('/sync', async (_req, res) => {
  await syncCalendar()
  res.json(await getCalendar(fetch, false))
})

calendarRouter.post('/exams', async (req, res) => {
  res.status(201).json({ exam: await addManualExam(ManualExamSchema.parse(req.body)) })
})

calendarRouter.patch('/exams/:id', async (req, res) => {
  res.json({ exam: await updateExam(Id.parse(req.params.id), UpdateExamSchema.parse(req.body)) })
})

calendarRouter.delete('/exams/:id', async (req, res) => {
  await deleteExam(Id.parse(req.params.id))
  res.status(204).end()
})

calendarRouter.put('/facts', async (req, res) => {
  await setDailyFacts(z.object({ on: z.boolean() }).parse(req.body).on)
  res.json({ ok: true })
})
