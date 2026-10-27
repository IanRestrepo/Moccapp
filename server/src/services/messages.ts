// Mensajitos de Ian: se guardan para esa persona y su app los recoge en la siguiente señal de vida
// (cada ~15 s mientras está abierta) para que Mocca los diga. Si no está en la app, le esperan.
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm'
import type { MoccaMessageDTO, MoccaMessageMood, SentMoccaMessageDTO } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { moccaMessages } from '../db/schema.js'
import { OWNER, currentProfile } from '../lib/profile.js'
import { AppError } from '../lib/errors.js'
import { sendPush } from './push.js'

/** Más viejos que esto ya no se muestran (llegaría fuera de contexto) */
const MAX_AGE_MS = 3 * 24 * 3600_000

export async function sendMoccaMessage(p: { profile: string; text: string; mood: MoccaMessageMood; push: boolean }): Promise<SentMoccaMessageDTO> {
  // los mensajitos de Ian son solo para Ash
  if (p.profile !== OWNER) throw new AppError(403, 'OWNER_ONLY', 'Los mensajitos de Mocca son solo para Ashley.')
  const [m] = await db.insert(moccaMessages).values(p).returning()
  if (p.push) await sendPush({ profile: p.profile }, { title: 'Mocca te trae un mensajito 💌', body: p.text, url: '/#/', tag: `mensaje-${m!.id}` })
  return toSent(m!)
}

const toSent = (m: typeof moccaMessages.$inferSelect): SentMoccaMessageDTO => ({
  id: m.id,
  profile: m.profile,
  text: m.text,
  mood: m.mood as MoccaMessageMood,
  createdAt: m.createdAt.toISOString(),
  deliveredAt: m.deliveredAt?.toISOString() ?? null,
  seenAt: m.seenAt?.toISOString() ?? null,
})

export async function listSentMessages(limit = 30): Promise<SentMoccaMessageDTO[]> {
  return (await db.select().from(moccaMessages).orderBy(desc(moccaMessages.createdAt)).limit(limit)).map(toSent)
}

/** Los que esta persona todavía no ha visto (en orden de llegada) */
export async function pendingMessages(now = new Date()): Promise<MoccaMessageDTO[]> {
  const rows = await db
    .select()
    .from(moccaMessages)
    .where(
      and(
        eq(moccaMessages.profile, currentProfile()),
        isNull(moccaMessages.seenAt),
        gt(moccaMessages.createdAt, new Date(now.getTime() - MAX_AGE_MS)),
      ),
    )
    .orderBy(moccaMessages.createdAt)
    .limit(5)
  const undelivered = rows.filter((r) => !r.deliveredAt).map((r) => r.id)
  if (undelivered.length) await db.update(moccaMessages).set({ deliveredAt: now }).where(inArray(moccaMessages.id, undelivered))
  return rows.map((r) => ({ id: r.id, text: r.text, mood: r.mood as MoccaMessageMood }))
}

export async function markSeen(id: string) {
  await db
    .update(moccaMessages)
    .set({ seenAt: new Date() })
    .where(and(eq(moccaMessages.id, id), eq(moccaMessages.profile, currentProfile()), isNull(moccaMessages.seenAt)))
}
