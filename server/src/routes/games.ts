import { Router } from 'express'
import { z } from 'zod'
import { completeWordSearch, getAlbum, listGames, newWordSearch, openPack } from '../services/games.js'

// Jueguitos (sopa de letras) y la colección de Moccas que sale de los sobres
export const gamesRouter = Router()
export const albumRouter = Router()
const Id = z.string().uuid()

gamesRouter.get('/', async (_req, res) => {
  res.json(await listGames())
})

/** Una sopa nueva con los términos de esa fuente */
gamesRouter.post('/wordsearch', async (req, res) => {
  const { sourceId } = z.object({ sourceId: Id }).parse(req.body)
  res.status(201).json(await newWordSearch(sourceId))
})

/** La terminó: suma XP y, si no ha llegado al tope del día, gana un sobre */
gamesRouter.post('/:id/complete', async (req, res) => {
  res.json(await completeWordSearch(Id.parse(req.params.id)))
})

albumRouter.get('/', async (_req, res) => {
  res.json(await getAlbum())
})

albumRouter.post('/open', async (_req, res) => {
  res.json(await openPack())
})
