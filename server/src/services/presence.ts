// Presencia: la app de Ashley manda una señal cada ~30 s mientras está abierta y visible.
// "En línea" = señal reciente. La última vez se guarda en la base para sobrevivir reinicios.
import { eq } from 'drizzle-orm'
import type { PresenceDTO, PresenceView } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { userStats } from '../db/schema.js'
import { currentProfile, displayNameFor, profileNames, statsIdFor } from '../lib/profile.js'

export const ONLINE_WINDOW_MS = 75_000
/** No se escribe en la base en cada señal: basta cada minuto o si cambió de pantalla/dispositivo */
const PERSIST_EVERY_MS = 60_000

interface Seen {
  at: Date
  view: PresenceView
  device: string | null
}
// En Vercel cada petición puede caer en otra instancia: la memoria no sirve, todo va a la base
const SERVERLESS = !!process.env.VERCEL
// por perfil
const live = new Map<string, Seen>()
const persisted = new Map<string, Seen>()

export function deviceFrom(ua: string | undefined): string | null {
  if (!ua) return null
  if (/iPad/.test(ua)) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android' : 'Tablet Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Linux/.test(ua)) return 'Linux'
  return null
}

export async function recordPing(view: PresenceView, ua: string | undefined, now = new Date()) {
  const profile = currentProfile()
  const seen: Seen = { at: now, view, device: deviceFrom(ua) ?? live.get(profile)?.device ?? null }
  live.set(profile, seen)
  const prev = persisted.get(profile)
  const stale =
    SERVERLESS || !prev || now.getTime() - prev.at.getTime() >= PERSIST_EVERY_MS || prev.view !== seen.view || prev.device !== seen.device
  if (!stale) return
  persisted.set(profile, seen)
  // si esta señal no dice qué dispositivo es, se conserva el último conocido
  const values = { lastSeenAt: seen.at, lastSeenView: seen.view, ...(seen.device ? { lastSeenDevice: seen.device } : {}) }
  await db
    .insert(userStats)
    .values({ id: statsIdFor(profile), displayName: displayNameFor(profile), ...values })
    .onConflictDoUpdate({ target: userStats.id, set: values })
}

export async function getPresence(now = new Date(), profile = currentProfile()): Promise<PresenceDTO> {
  let seen = SERVERLESS ? null : (live.get(profile) ?? null)
  if (!seen) {
    const [row] = await db
      .select()
      .from(userStats)
      .where(eq(userStats.id, statsIdFor(profile)))
    if (row?.lastSeenAt)
      seen = { at: row.lastSeenAt, view: (row.lastSeenView as PresenceView | null) ?? 'other', device: row.lastSeenDevice }
  }
  if (!seen) return { online: false, lastSeenAt: null, view: null, device: null }
  return {
    online: now.getTime() - seen.at.getTime() < ONLINE_WINDOW_MS,
    lastSeenAt: seen.at.toISOString(),
    view: seen.view,
    device: seen.device,
  }
}

/** Para el panel: todas las personas con acceso */
export async function getAllPresence(now = new Date()) {
  return Promise.all(profileNames().map(async (p) => ({ profile: p, name: displayNameFor(p), ...(await getPresence(now, p)) })))
}

/** Solo para pruebas */
export function resetPresence() {
  live.clear()
  persisted.clear()
}
