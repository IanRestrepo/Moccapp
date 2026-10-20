import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { UpdateStatsSchema } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { userStats } from '../db/schema.js'
import { getStatsRow, toStatsDTO } from '../services/gamification.js'
import { bonesBalance } from '../services/rewards.js'

const statsDTO = async () => toStatsDTO(await getStatsRow(), new Date(), (await bonesBalance()).balance)

export const statsRouter = Router()

statsRouter.get('/', async (_req, res) => {
  res.json({ stats: await statsDTO() })
})

statsRouter.patch('/', async (req, res) => {
  const patch = UpdateStatsSchema.parse(req.body)
  await getStatsRow()
  if (Object.keys(patch).length) await db.update(userStats).set({ ...patch, updatedAt: new Date() }).where(eq(userStats.id, 1))
  res.json({ stats: await statsDTO() })
})
