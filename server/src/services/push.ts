// Notificaciones push (Web Push). Funcionan con la app instalada en el inicio del celular
// (en iPhone solo así) y en navegadores de escritorio. Sin llaves VAPID no hace nada.
import { and, eq, inArray } from 'drizzle-orm'
import webpush from 'web-push'
import type { PushPayload } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { pushSubscriptions } from '../db/schema.js'
import { env } from '../env.js'

export const pushEnabled = () => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
let configured = false
function configure() {
  if (configured || !pushEnabled()) return
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!)
  configured = true
}

export interface BrowserSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export async function saveSubscription(sub: BrowserSubscription, profile: string, admin: boolean) {
  const values = { endpoint: sub.endpoint, profile, admin, p256dh: sub.keys.p256dh, auth: sub.keys.auth }
  await db.insert(pushSubscriptions).values(values).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values })
}

export async function removeSubscription(endpoint: string) {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
}

/** A quién: los celulares de un perfil, o los del administrador */
export type Audience = { profile: string } | { admin: true }

/** Envía a todos los dispositivos de esa persona. Los que ya no existen (410/404) se borran. Nunca lanza. */
export async function sendPush(to: Audience, payload: PushPayload): Promise<number> {
  if (!pushEnabled()) return 0
  configure()
  try {
    const where = 'admin' in to ? eq(pushSubscriptions.admin, true) : and(eq(pushSubscriptions.profile, to.profile), eq(pushSubscriptions.admin, false))
    const subs = await db.select().from(pushSubscriptions).where(where)
    const gone: string[] = []
    let sent = 0
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
            TTL: 12 * 3600,
            urgency: 'normal',
          })
          sent++
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) gone.push(s.endpoint)
          else console.warn(`[push] falló (${code ?? err}): ${s.endpoint.slice(0, 60)}…`)
        }
      }),
    )
    if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, gone))
    return sent
  } catch (err) {
    console.warn('[push] error', err)
    return 0
  }
}
