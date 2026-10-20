// Premios de Ashley: se canjean con huesitos (moneda aparte de la XP). Los define y entrega el administrador.
import { and, asc, desc, eq, ne, sql, sum } from 'drizzle-orm'
import { computeBones, type RedemptionDTO, type RewardDTO, type RewardInput, type RewardSticker, type RewardsDTO } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { exams, redemptions, rewards, userStats, type Redemption, type Reward } from '../db/schema.js'
import { env } from '../env.js'
import { AppError, Errors } from '../lib/errors.js'

/** Escalera inicial: el heladito sale en ~5 exámenes; el viaje es la meta grande. Él los ajusta en #/admin. */
export const DEFAULT_REWARDS: (RewardInput & { sort: number })[] = [
  { sort: 1, sticker: 'icecream', cost: 150, name: 'Heladito', description: 'Un helado del sabor que quieras' },
  { sort: 2, sticker: 'coffee', cost: 250, name: 'Café o té', description: 'Tu bebida favorita en tu café favorito' },
  { sort: 3, sticker: 'cake', cost: 400, name: 'Antojo dulce', description: 'Torta, brownie o lo que se te antoje' },
  { sort: 4, sticker: 'ticket', cost: 900, name: 'Cine', description: 'Boletas y crispetas para la película que elijas' },
  { sort: 5, sticker: 'dinner', cost: 1500, name: 'Cena especial', description: 'Cena en tu restaurante favorito' },
  { sort: 6, sticker: 'spa', cost: 2500, name: 'Día de spa', description: 'Masaje o spa para descansar del estudio' },
  { sort: 7, sticker: 'mountain', cost: 5000, name: 'Paseo de fin de semana', description: 'Una escapada fuera de la ciudad' },
  { sort: 8, sticker: 'plane', cost: 20000, name: 'Viaje internacional', description: '¡El gran premio! Un viaje fuera del país' },
]

// ── Preparación (una vez por arranque) ───────────────────────

let setup: Promise<void> | null = null

/**
 * Crea los premios iniciales, pone el nombre de la dueña y abona los huesitos de los exámenes
 * que hizo antes de que existieran los premios. Es idempotente.
 */
export function ensureRewardsSetup(): Promise<void> {
  return (setup ??= (async () => {
    await db.insert(userStats).values({ id: 1 }).onConflictDoNothing()
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(rewards)
    if (n === 0) await db.insert(rewards).values(DEFAULT_REWARDS)

    const [stats] = await db.select().from(userStats).where(eq(userStats.id, 1))
    if (stats?.displayName === 'Doc') await db.update(userStats).set({ displayName: env.OWNER_NAME }).where(eq(userStats.id, 1))

    if (stats && !stats.bonesBackfilled) {
      const done = await db.select().from(exams).where(eq(exams.status, 'completed'))
      let total = 0
      for (const e of done) {
        const bones = computeBones({
          credits: ((e.percent ?? 0) / 100) * e.questionCount,
          questionCount: e.questionCount,
          score: e.score ?? 0,
          percent: e.percent ?? 0,
          firstOfDay: false,
          streak: 0,
        })
        total += bones
        await db.update(exams).set({ bonesEarned: bones }).where(eq(exams.id, e.id))
      }
      await db
        .update(userStats)
        .set({ bonesEarned: sql`${userStats.bonesEarned} + ${total}`, bonesBackfilled: true })
        .where(eq(userStats.id, 1))
    }
  })().catch((err) => {
    setup = null // se reintenta en la próxima llamada
    throw err
  }))
}

// ── Saldo ────────────────────────────────────────────────────

export async function bonesBalance(): Promise<{ balance: number; earnedTotal: number }> {
  await ensureRewardsSetup()
  const [stats] = await db.select({ earned: userStats.bonesEarned }).from(userStats).where(eq(userStats.id, 1))
  const [spent] = await db.select({ total: sum(redemptions.cost) }).from(redemptions).where(ne(redemptions.status, 'cancelled'))
  const earnedTotal = stats?.earned ?? 0
  return { balance: earnedTotal - Number(spent?.total ?? 0), earnedTotal }
}

// ── DTO ──────────────────────────────────────────────────────

const toReward = (r: Reward): RewardDTO => ({
  id: r.id,
  name: r.name,
  description: r.description,
  sticker: r.sticker as RewardSticker,
  cost: r.cost,
  sort: r.sort,
  active: r.active,
})

const toRedemption = (r: Redemption): RedemptionDTO => ({
  id: r.id,
  rewardName: r.rewardName,
  sticker: r.sticker as RewardSticker,
  cost: r.cost,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  resolvedAt: r.resolvedAt?.toISOString() ?? null,
})

export async function getRewards(opts: { includeInactive?: boolean } = {}): Promise<RewardsDTO> {
  const { balance, earnedTotal } = await bonesBalance()
  const list = await db
    .select()
    .from(rewards)
    .where(opts.includeInactive ? undefined : eq(rewards.active, true))
    .orderBy(asc(rewards.sort), asc(rewards.cost))
  const history = await db.select().from(redemptions).orderBy(desc(redemptions.createdAt)).limit(100)
  const [stats] = await db.select({ name: userStats.displayName }).from(userStats).where(eq(userStats.id, 1))
  return {
    ownerName: stats?.name ?? env.OWNER_NAME,
    balance,
    earnedTotal,
    rewards: list.map(toReward),
    redemptions: history.map(toRedemption),
  }
}

// ── Reclamar ─────────────────────────────────────────────────

/** Mensaje de WhatsApp que ella le manda al administrador al reclamar */
export function whatsappUrl(reward: { name: string; cost: number }): string | null {
  if (!env.ADMIN_WHATSAPP) return null
  const text = `¡Hola! 🐾 Reclamé «${reward.name}» en VetQuiz con ${reward.cost.toLocaleString('es-CO')} huesitos. ¡Me lo gané estudiando! 🦴`
  return `https://wa.me/${env.ADMIN_WHATSAPP}?text=${encodeURIComponent(text)}`
}

export async function redeem(rewardId: string) {
  await ensureRewardsSetup()
  const [reward] = await db.select().from(rewards).where(and(eq(rewards.id, rewardId), eq(rewards.active, true)))
  if (!reward) throw Errors.notFound('Ese premio')
  const { balance } = await bonesBalance()
  if (balance < reward.cost)
    throw new AppError(409, 'NOT_ENOUGH_BONES', `Te faltan ${(reward.cost - balance).toLocaleString('es-CO')} huesitos para este premio. ¡Sigue estudiando!`)

  const [created] = await db
    .insert(redemptions)
    .values({ rewardId: reward.id, rewardName: reward.name, sticker: reward.sticker, cost: reward.cost })
    .returning()
  return { redemption: toRedemption(created!), balance: balance - reward.cost, whatsappUrl: whatsappUrl(reward) }
}

// ── Administrador ────────────────────────────────────────────

export async function createReward(input: RewardInput): Promise<RewardDTO> {
  await ensureRewardsSetup()
  const [{ max } = { max: 0 }] = await db.select({ max: sql<number>`coalesce(max(${rewards.sort}), 0)::int` }).from(rewards)
  const [r] = await db
    .insert(rewards)
    .values({ ...input, sort: input.sort ?? max + 1 })
    .returning()
  return toReward(r!)
}

export async function updateReward(id: string, patch: Partial<RewardInput>): Promise<RewardDTO> {
  const [r] = await db.update(rewards).set(patch).where(eq(rewards.id, id)).returning()
  if (!r) throw Errors.notFound('Ese premio')
  return toReward(r)
}

/** Si el premio ya tiene canjes se oculta (para no perder el historial); si no, se borra. */
export async function deleteReward(id: string): Promise<void> {
  const used = await db.select({ id: redemptions.id }).from(redemptions).where(eq(redemptions.rewardId, id)).limit(1)
  if (used.length) await db.update(rewards).set({ active: false }).where(eq(rewards.id, id))
  else await db.delete(rewards).where(eq(rewards.id, id))
}

/** Entregar o cancelar un canje pendiente. Cancelar le devuelve los huesitos (el saldo no cuenta los cancelados). */
export async function resolveRedemption(id: string, status: 'delivered' | 'cancelled'): Promise<RedemptionDTO> {
  const [r] = await db
    .update(redemptions)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(redemptions.id, id), eq(redemptions.status, 'pending')))
    .returning()
  if (!r) throw Errors.conflict('NOT_PENDING', 'Ese premio ya fue entregado o cancelado.')
  return toRedemption(r)
}

/** Regalo del administrador (por ejemplo, por pasar un parcial de verdad) */
export async function grantBones(amount: number): Promise<{ balance: number; earnedTotal: number }> {
  await ensureRewardsSetup()
  await db
    .update(userStats)
    .set({ bonesEarned: sql`${userStats.bonesEarned} + ${amount}` })
    .where(eq(userStats.id, 1))
  return bonesBalance()
}
