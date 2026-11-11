// Avisos al celular de Mocca (Vercel Cron):
// - En la noche (~7 p. m. Bogotá): si tiene un parcial en 7, 3, 2 o 1 días, se lo recuerda y la invita a practicar
//   con las fuentes de esa materia; si no, el empujoncito de siempre para no perder la racha.
// - En la mañana (~7 a. m.): el día del parcial, ánimo y repaso rápido; los demás días, un dato curioso de lo que
//   está estudiando (sale de sus guías de estudio, o del banco de preguntas si aún no tiene guías).
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import { examEvents, questionBank, sources, studyGuides, userStats, type ExamEvent } from '../db/schema.js'
import { displayNameFor, profileNames, runAs, statsIdFor, visibleOwners } from '../lib/profile.js'
import { daysUntil, syncCalendar, upcomingExams } from './calendar.js'
import { getStatsRow, localDate } from './gamification.js'
import { sendPush } from './push.js'

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!
/** Días antes del parcial en que se avisa en la noche */
export const EXAM_NOTICE_DAYS = [7, 3, 2, 1]

const firstName = (profile: string) => displayNameFor(profile).split(' ')[0] ?? ''
/** "Parcial 2 - Bioquímica (Grupo 3)" → "Parcial 2 - Bioquímica" para que quepa en el aviso */
const short = (title: string) => title.replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 60)
/** A dónde lleva el aviso: la guía de la primera fuente de esa materia (para repasar), o el calendario */
const studyUrl = (e: ExamEvent) => (e.sourceIds[0] ? `/#/guia/${e.sourceIds[0]}` : '/#/calendario')

async function markNotified(e: ExamEvent, days: number) {
  await db
    .update(examEvents)
    .set({ notified: [...new Set([...e.notified, days])] })
    .where(eq(examEvents.id, e.id))
}

export function examNoticeText(e: ExamEvent, days: number, name: string) {
  const what = short(e.title)
  const practice = e.sourceIds.length ? 'Mocca te armó el repaso con tus fuentes.' : 'Liga tus fuentes en el calendario y Mocca te arma el repaso.'
  if (days === 1)
    return { title: `📚 Mañana: ${what}`, body: `${name}, un último repaso del mapa conceptual y a dormir temprano. ¡Tú puedes! ${practice}` }
  if (days === 7) return { title: `🗓️ En una semana: ${what}`, body: `Empieza hoy con calma: lee un tema de la guía y haz su mini examen. ${practice}` }
  return { title: `⏳ Faltan ${days} días: ${what}`, body: pick([`${name}, 15 minutos de práctica hoy hacen la diferencia.`, 'Haz el mini examen de un tema que te cueste.']) + ` ${practice}` }
}

/** Noche: avisos de parciales cercanos; si no hay, el de la racha */
export async function sendDailyReminders(now = new Date()) {
  const today = localDate(now)
  const results: { profile: string; sent: number; kind: string }[] = []
  for (const profile of profileNames()) {
    const name = firstName(profile)
    // primero se lee el calendario (por si agregó o movió un parcial)
    await syncCalendar(profile).catch(() => {})
    const exams = await upcomingExams(profile, now)
    const due = exams
      .map((e) => ({ e, days: daysUntil(e.startsAt, now) }))
      .filter(({ e, days }) => EXAM_NOTICE_DAYS.includes(days) && !e.notified.includes(days))
    if (due.length) {
      // uno por noche: el más cercano (los demás tendrán su turno)
      const { e, days } = due[0]!
      const sent = await sendPush({ profile }, { ...examNoticeText(e, days, name), url: studyUrl(e), tag: `parcial-${e.id}` })
      await markNotified(e, days)
      results.push({ profile, sent, kind: `parcial en ${days} días` })
      continue
    }
    const stats = await runAs(profile, () => getStatsRow())
    if (stats.lastActiveDate === today) {
      results.push({ profile, sent: 0, kind: 'ya estudió hoy' })
      continue
    }
    // la racha sigue viva si estudió ayer: hoy es el día de no perderla
    const streak = stats.currentStreak
    const next = exams[0]
    const payload =
      next && daysUntil(next.startsAt, now) <= 14
        ? { title: `📚 ${short(next.title)} en ${daysUntil(next.startsAt, now)} días`, body: `${name}, una lección corta hoy y llegas lista.` }
        : streak >= 2
          ? { title: `🔥 ¡Tu racha de ${streak} días!`, body: pick([`${name}, una lección corta y no la pierdes.`, 'Mocca está cuidando tu racha. 5 minutos y listo.']) }
          : {
              title: pick(['Mocca te extraña 🐾', '¿5 minutos con Mocca?']),
              body: pick([`${name}, unas tarjetas antes de dormir y mañana te lo agradeces.`, 'Una lección del camino y sumas XP. ¡Vamos!']),
            }
    results.push({ profile, sent: await sendPush({ profile }, { ...payload, url: next ? studyUrl(next) : '/#/camino', tag: 'recordatorio' }), kind: 'racha' })
  }
  return results
}

// ── Datos curiosos ───────────────────────────────────────────

const MAX_FACT = 170
const fits = (s: string) => s.length >= 25 && s.length <= MAX_FACT
const plain = (s: string) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()

/** Un dato para aprender de una de sus fuentes; prefiere las de su próximo parcial */
export async function pickFact(profile: string, preferred: string[] = []): Promise<{ text: string; url: string } | null> {
  const visible = (
    await db
      .select({ id: sources.id })
      .from(sources)
      .where(and(eq(sources.status, 'ready'), inArray(sources.owner, visibleOwners(profile))))
  ).map((s) => s.id)
  if (!visible.length) return null
  const pool = preferred.filter((id) => visible.includes(id))
  const ids = pool.length ? pool : visible
  const guides = await db.select().from(studyGuides).where(and(inArray(studyGuides.sourceId, ids), eq(studyGuides.status, 'ready')))
  const facts: { text: string; url: string }[] = []
  for (const g of guides) {
    const url = `/#/guia/${g.sourceId}`
    for (const s of g.data?.sections ?? []) {
      if (s.tip && fits(plain(s.tip))) facts.push({ text: plain(s.tip), url })
      for (const k of s.keyPoints) if (fits(plain(k))) facts.push({ text: plain(k), url })
      for (const t of s.terms) {
        const text = `${t.term}: ${plain(t.definition)}`
        if (fits(text)) facts.push({ text, url })
      }
    }
    for (const b of g.data?.conceptMap.branches ?? [])
      for (const c of b.children ?? []) if (c.detail && fits(plain(c.detail))) facts.push({ text: plain(c.detail), url })
  }
  if (facts.length) return pick(facts)
  // sin guías todavía: la explicación de una pregunta del banco
  const qs = await db
    .select({ explanation: questionBank.explanation, sourceId: questionBank.sourceId })
    .from(questionBank)
    .where(inArray(questionBank.sourceId, ids))
    .limit(200)
  const ok = qs.filter((q) => fits(plain(q.explanation)))
  if (!ok.length) return null
  const q = pick(ok)
  return { text: plain(q.explanation), url: `/#/guia/${q.sourceId}` }
}

/** Mañana: el día del parcial, ánimo; si no, un dato curioso (si no lo apagó) */
export async function sendMorningNudges(now = new Date()) {
  const results: { profile: string; sent: number; kind: string }[] = []
  for (const profile of profileNames()) {
    const name = firstName(profile)
    const exams = await upcomingExams(profile, now)
    const today = exams.find((e) => daysUntil(e.startsAt, now) === 0 && !e.notified.includes(0))
    if (today) {
      const sent = await sendPush(
        { profile },
        {
          title: `💪 ¡Hoy es ${short(today.title)}!`,
          body: `${name}, estudiaste para esto. Dale una mirada al mapa conceptual y entra tranquila. Mocca y Ian creen en ti.`,
          url: studyUrl(today),
          tag: `parcial-${today.id}`,
        },
      )
      await markNotified(today, 0)
      results.push({ profile, sent, kind: 'parcial hoy' })
      continue
    }
    const [stats] = await db.select({ dailyFacts: userStats.dailyFacts }).from(userStats).where(eq(userStats.id, statsIdFor(profile)))
    if (stats && !stats.dailyFacts) {
      results.push({ profile, sent: 0, kind: 'datos curiosos apagados' })
      continue
    }
    // del próximo parcial si hay uno en las próximas dos semanas
    const soon = exams.find((e) => daysUntil(e.startsAt, now) <= 14)
    const fact = await pickFact(profile, soon?.sourceIds ?? [])
    if (!fact) {
      results.push({ profile, sent: 0, kind: 'sin datos' })
      continue
    }
    const sent = await sendPush(
      { profile },
      { title: pick(['🐾 ¿Sabías que…?', '💡 Dato de Mocca', '🧠 Para que no se te olvide']), body: fact.text, url: fact.url, tag: 'dato-curioso' },
    )
    results.push({ profile, sent, kind: 'dato curioso' })
  }
  return results
}
