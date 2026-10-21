// Recordatorio diario (Vercel Cron, ~7 p. m. en Bogotá): a quien no ha estudiado hoy, un empujoncito de Mocca.
import { displayNameFor, profileNames, runAs } from '../lib/profile.js'
import { getStatsRow, localDate } from './gamification.js'
import { sendPush } from './push.js'

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!

export async function sendDailyReminders(now = new Date()) {
  const today = localDate(now)
  const results: { profile: string; sent: number; skipped?: string }[] = []
  for (const profile of profileNames()) {
    const stats = await runAs(profile, () => getStatsRow())
    if (stats.lastActiveDate === today) {
      results.push({ profile, sent: 0, skipped: 'ya estudió hoy' })
      continue
    }
    const name = displayNameFor(profile).split(' ')[0]
    // la racha sigue viva si estudió ayer: hoy es el día de no perderla
    const streak = stats.currentStreak
    const payload =
      streak >= 2
        ? { title: `🔥 ¡Tu racha de ${streak} días!`, body: pick([`${name}, una lección corta y no la pierdes.`, 'Mocca está cuidando tu racha. 5 minutos y listo.']) }
        : {
            title: pick(['Mocca te extraña 🐾', '¿5 minutos con Mocca?']),
            body: pick([`${name}, unas tarjetas antes de dormir y mañana te lo agradeces.`, 'Una lección del camino y sumas XP. ¡Vamos!']),
          }
    results.push({ profile, sent: await sendPush({ profile }, { ...payload, url: '/#/camino', tag: 'recordatorio' }) })
  }
  return results
}
