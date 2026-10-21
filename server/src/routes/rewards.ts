import { Router } from 'express'
import { z } from 'zod'
import { PresencePingSchema, RewardInputSchema } from '@vetquiz/shared'
import { adminStatus, enterAdmin, isAdmin, requireAdmin, requireOwner } from '../lib/access.js'
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
import { getAllPresence, recordPing } from '../services/presence.js'

const Id = z.string().uuid()
const parseId = (raw: unknown, what = 'Ese premio') => {
  const r = Id.safeParse(raw)
  if (!r.success) throw Errors.notFound(what)
  return r.data
}

// ── Lo que ve Ashley ─────────────────────────────────────────
export const rewardsRouter = Router()
rewardsRouter.use(requireOwner)

rewardsRouter.get('/', async (_req, res) => {
  res.json(await getRewards())
})

rewardsRouter.post('/:id/redeem', async (req, res) => {
  res.status(201).json(await redeem(parseId(req.params.id)))
})

// Señal de vida de la app. Si quien la abre es el administrador, no cuenta como Ashley.
export const presenceRouter = Router()

presenceRouter.post('/', async (req, res) => {
  if (!isAdmin(req)) await recordPing(PresencePingSchema.parse(req.body ?? {}).view, req.get('user-agent'))
  res.status(204).end()
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

adminRouter.get('/presence', async (_req, res) => {
  res.json({ people: await getAllPresence() })
})
