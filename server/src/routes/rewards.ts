import { Router } from 'express'
import { z } from 'zod'
import { PresencePingSchema, RewardInputSchema, SendMoccaMessageSchema } from '@vetquiz/shared'
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
import { listSentMessages, markSeen, pendingMessages, sendMoccaMessage } from '../services/messages.js'
import { getStatsRow, localDate } from '../services/gamification.js'
import { bonesBalance } from '../services/rewards.js'
import { OWNER, runAs } from '../lib/profile.js'
import { levelFromXp } from '@vetquiz/shared'

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

// Responde con los mensajitos de Ian que estén esperando (Mocca los dice en la app)
presenceRouter.post('/', async (req, res) => {
  if (isAdmin(req)) return void res.json({ messages: [] })
  await recordPing(PresencePingSchema.parse(req.body ?? {}).view, req.get('user-agent'))
  res.json({ messages: await pendingMessages() })
})

presenceRouter.post('/messages/:id/seen', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id)
  if (id.success) await markSeen(id.data)
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

// Panel: cada persona con su estado y sus números
adminRouter.get('/overview', async (_req, res) => {
  const today = localDate(new Date())
  const people = await Promise.all(
    (await getAllPresence()).map(async (p) => {
      const row = await runAs(p.profile, () => getStatsRow())
      const alive = row.lastActiveDate === today || row.lastActiveDate === localDate(new Date(Date.now() - 86_400_000))
      return {
        ...p,
        stats: {
          xp: row.totalXp,
          level: levelFromXp(row.totalXp),
          streak: alive ? row.currentStreak : 0,
          bones: p.profile === OWNER ? (await bonesBalance()).balance : null,
          examsCompleted: row.examsCompleted,
          studiedToday: row.lastActiveDate === today,
        },
      }
    }),
  )
  res.json({ people })
})

// Mensajitos de Mocca
adminRouter.get('/messages', async (_req, res) => {
  res.json({ messages: await listSentMessages() })
})

adminRouter.post('/messages', async (req, res) => {
  res.status(201).json({ message: await sendMoccaMessage(SendMoccaMessageSchema.parse(req.body)) })
})
