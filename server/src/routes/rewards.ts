import { Router } from 'express'
import { z } from 'zod'
import { RewardInputSchema } from '@vetquiz/shared'
import { adminStatus, enterAdmin, requireAdmin } from '../lib/access.js'
import { Errors } from '../lib/errors.js'
import { env } from '../env.js'
import {
  createReward,
  deleteReward,
  getRewards,
  grantBones,
  redeem,
  resolveRedemption,
  updateReward,
} from '../services/rewards.js'

const Id = z.string().uuid()
const parseId = (raw: unknown, what = 'Ese premio') => {
  const r = Id.safeParse(raw)
  if (!r.success) throw Errors.notFound(what)
  return r.data
}

// ── Lo que ve Ashley ─────────────────────────────────────────
export const rewardsRouter = Router()

rewardsRouter.get('/', async (_req, res) => {
  res.json(await getRewards())
})

rewardsRouter.post('/:id/redeem', async (req, res) => {
  res.status(201).json(await redeem(parseId(req.params.id)))
})

// ── Administrador ────────────────────────────────────────────
export const adminRouter = Router()

adminRouter.get('/status', adminStatus)
adminRouter.post('/login', enterAdmin)
adminRouter.use(requireAdmin)

adminRouter.get('/rewards', async (_req, res) => {
  res.json({ ...(await getRewards({ includeInactive: true })), whatsappConfigured: !!env.ADMIN_WHATSAPP })
})

adminRouter.post('/rewards', async (req, res) => {
  res.status(201).json({ reward: await createReward(RewardInputSchema.parse(req.body)) })
})

adminRouter.patch('/rewards/:id', async (req, res) => {
  res.json({ reward: await updateReward(parseId(req.params.id), RewardInputSchema.partial().parse(req.body)) })
})

adminRouter.delete('/rewards/:id', async (req, res) => {
  await deleteReward(parseId(req.params.id))
  res.status(204).end()
})

adminRouter.patch('/redemptions/:id', async (req, res) => {
  const { status } = z.object({ status: z.enum(['delivered', 'cancelled']) }).parse(req.body)
  res.json({ redemption: await resolveRedemption(parseId(req.params.id, 'Ese canje'), status) })
})

adminRouter.post('/bones', async (req, res) => {
  const { amount } = z.object({ amount: z.number().int().min(1).max(100_000) }).parse(req.body)
  res.json(await grantBones(amount))
})
