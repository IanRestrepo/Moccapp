// XP, nivel y racha diaria. Base para la gamificación futura; nunca bloquea ni limita nada.
import { eq, sql } from 'drizzle-orm'
import { LEVEL_XP_MULTIPLIER, computeBones, levelFromXp, xpForLevel, type ExamLevel, type StatsDTO } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { userStats, type UserStats } from '../db/schema.js'
import { env } from '../env.js'
import { MOTIVATION } from '../ai/prompts.js'
import { ensureRewardsSetup } from './rewards.js'

/** Fecha local YYYY-MM-DD en la zona de la app (Bogotá): la racha cuenta días de ella, no UTC. */
export function localDate(d: Date, timeZone = env.APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface StreakState {
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
}

/** Reglas: mismo día no cambia; día siguiente suma 1; si se saltó un día vuelve a 1. */
export function nextStreak(s: StreakState, today: string): StreakState & { extendedToday: boolean } {
  if (s.lastActiveDate === today) return { ...s, extendedToday: false }
  const current = s.lastActiveDate === addDays(today, -1) ? s.currentStreak + 1 : 1
  return { currentStreak: current, longestStreak: Math.max(s.longestStreak, current), lastActiveDate: today, extendedToday: true }
}

/**
 * XP del examen:
 *  10 × créditos × multiplicador del nivel (Fácil 1 · Medio 1.25 · Difícil 1.5 · UTP 2)
 *  +20 por terminar · +25 si nota ≥ 4.0 (+50 si es 5.0) · primer examen del día: +10 × min(racha, 7)
 */
export function computeXp(p: { credits: number; level: ExamLevel; score: number; firstOfDay: boolean; streak: number }): number {
  const base = 10 * p.credits * LEVEL_XP_MULTIPLIER[p.level]
  const finish = 20
  const scoreBonus = p.score >= 5 ? 50 : p.score >= 4 ? 25 : 0
  const streakBonus = p.firstOfDay ? 10 * Math.min(p.streak, 7) : 0
  return Math.round(base + finish + scoreBonus + streakBonus)
}

export function motivationFor(score: number, rng = Math.random): string {
  const pool = score >= 4.5 ? MOTIVATION.top : score >= 4 ? MOTIVATION.good : score >= 3 ? MOTIVATION.pass : MOTIVATION.low
  return pool[Math.floor(rng() * pool.length)]!
}

export async function getStatsRow(): Promise<UserStats> {
  await db.insert(userStats).values({ id: 1 }).onConflictDoNothing()
  const [row] = await db.select().from(userStats).where(eq(userStats.id, 1))
  return row!
}

/**
 * Registra un examen terminado: actualiza racha y suma XP. Devuelve la XP ganada y la racha.
 * La XP depende de la racha (bono del primer examen del día), por eso se calcula aquí.
 */
export async function recordCompletedExam(p: {
  credits: number
  level: ExamLevel
  score: number
  percent: number
  questionCount: number
  finishedAt: Date
}): Promise<{ xp: number; bones: number; streak: { current: number; extendedToday: boolean } }> {
  // primero el abono de exámenes viejos (si no, este examen se contaría dos veces)
  await ensureRewardsSetup()
  const row = await getStatsRow()
  const today = localDate(p.finishedAt)
  const next = nextStreak(
    { currentStreak: row.currentStreak, longestStreak: row.longestStreak, lastActiveDate: row.lastActiveDate },
    today,
  )
  const xp = computeXp({ ...p, firstOfDay: next.extendedToday, streak: next.currentStreak })
  const bones = computeBones({ ...p, firstOfDay: next.extendedToday, streak: next.currentStreak })
  const activeDates = [...new Set([...row.activeDates, today])].sort().slice(-60)

  await db
    .update(userStats)
    .set({
      totalXp: sql`${userStats.totalXp} + ${xp}`,
      bonesEarned: sql`${userStats.bonesEarned} + ${bones}`,
      examsCompleted: sql`${userStats.examsCompleted} + 1`,
      currentStreak: next.currentStreak,
      longestStreak: next.longestStreak,
      lastActiveDate: next.lastActiveDate,
      activeDates,
      updatedAt: new Date(),
    })
    .where(eq(userStats.id, 1))

  return { xp, bones, streak: { current: next.currentStreak, extendedToday: next.extendedToday } }
}

/** `bones` = saldo de huesitos (lo calcula rewards.bonesBalance, que consulta los canjes) */
export function toStatsDTO(row: UserStats, now = new Date(), bones = 0): StatsDTO {
  const today = localDate(now)
  // si ayer no estudió, la racha que se muestra ya está rota (aunque la BD no se haya actualizado)
  const alive = row.lastActiveDate === today || row.lastActiveDate === addDays(today, -1)
  const level = levelFromXp(row.totalXp)
  const active = new Set(row.activeDates)
  return {
    displayName: row.displayName,
    soundEnabled: row.soundEnabled,
    totalXp: row.totalXp,
    level,
    xpIntoLevel: row.totalXp - xpForLevel(level),
    xpForNextLevel: xpForLevel(level + 1) - xpForLevel(level),
    currentStreak: alive ? row.currentStreak : 0,
    longestStreak: row.longestStreak,
    studiedToday: row.lastActiveDate === today,
    examsCompleted: row.examsCompleted,
    bones,
    week: Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i - 6)
      return { date, active: active.has(date) }
    }),
  }
}
