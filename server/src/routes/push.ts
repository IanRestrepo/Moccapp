import { Router } from 'express'
import { z } from 'zod'
import { PushSubscribeSchema } from '@vetquiz/shared'
import { env } from '../env.js'
import { isAdmin } from '../lib/access.js'
import { AppError } from '../lib/errors.js'
import { currentProfile, displayNameFor } from '../lib/profile.js'
import { pushEnabled, removeSubscription, saveSubscription, sendPush } from '../services/push.js'
import { sendDailyReminders, sendMorningNudges } from '../services/reminders.js'

// ── Avisos del celular (requiere acceso) ─────────────────────
export const pushRouter = Router()

pushRouter.get('/key', (_req, res) => {
  res.json({ enabled: pushEnabled(), publicKey: env.VAPID_PUBLIC_KEY ?? null })
})

pushRouter.post('/subscribe', async (req, res) => {
  if (!pushEnabled()) throw new AppError(503, 'PUSH_DISABLED', 'Los avisos no están configurados en el servidor.')
  const { subscription, admin } = PushSubscribeSchema.parse(req.body)
  // solo quien tiene la cookie de administrador puede recibir los avisos de premios
  await saveSubscription(subscription, currentProfile(), !!admin && isAdmin(req))
  const sent = await sendPush(
    admin && isAdmin(req) ? { admin: true } : { profile: currentProfile() },
    admin && isAdmin(req)
      ? { title: 'Avisos activados 🔔', body: 'Te llegará un aviso cuando reclamen un premio.', url: '/#/admin', tag: 'bienvenida-admin' }
      : { title: `¡Listo, ${displayNameFor().split(' ')[0]}! 🔔`, body: 'Mocca te avisará cuando tus fuentes estén listas y para cuidar tu racha.', url: '/#/', tag: 'bienvenida' },
  )
  res.json({ ok: true, sent })
})

pushRouter.post('/unsubscribe', async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body)
  await removeSubscription(endpoint)
  res.json({ ok: true })
})

// ── Vercel Cron (antes del candado; lo protege CRON_SECRET) ──
export const cronRouter = Router()

const checkCron = (auth: string | undefined) => {
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) throw new AppError(401, 'UNAUTHORIZED', 'No autorizado.')
}

/** Noche (~7 p. m.): parciales cercanos o racha */
cronRouter.get('/daily', async (req, res) => {
  checkCron(req.get('authorization'))
  res.json({ reminders: await sendDailyReminders() })
})

/** Mañana (~7 a. m.): día del parcial o dato curioso */
cronRouter.get('/morning', async (req, res) => {
  checkCron(req.get('authorization'))
  res.json({ nudges: await sendMorningNudges() })
})
