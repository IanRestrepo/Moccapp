// Calendario de la U: ella pega el enlace iCal privado de su calendario (Google, Outlook, Apple o el aula virtual)
// y aquí se leen sus parciales. Cada parcial se liga a las fuentes de esa materia para que Mocca le recuerde
// practicar con ellas. También puede agregar parciales a mano.
import { and, asc, eq, gte, inArray } from 'drizzle-orm'
import type { CalendarDTO, ExamEventDTO } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { calendarFeeds, collectionSources, collections, examEvents, sources, userStats, type ExamEvent } from '../db/schema.js'
import { env } from '../env.js'
import { AppError } from '../lib/errors.js'
import { currentProfile, statsIdFor, visibleOwners } from '../lib/profile.js'
import { getStatsRow, localDate } from './gamification.js'
import { looksLikeExam, parseIcs, zonedTime } from './ical.js'

const DAY = 86_400_000
/** Parciales de más adelante que esto no se guardan (el semestre completo sobra) */
const HORIZON_DAYS = 150
/** Se vuelve a leer el calendario si la última lectura es más vieja que esto */
const RESYNC_MS = 6 * 3600_000
const MAX_BYTES = 5 * 1024 * 1024

/** Días que faltan entre hoy y ese día, contados en la hora de Colombia (0 = hoy) */
export function daysUntil(date: Date, now = new Date()): number {
  const a = new Date(`${localDate(now)}T12:00:00Z`).getTime()
  const b = new Date(`${localDate(date)}T12:00:00Z`).getTime()
  return Math.round((b - a) / DAY)
}

// ── Ligar un parcial con las fuentes de su materia ───────────

const STOP = new Set(
  'de del la las el los y e en a al para por con un una unos unas su sus que se lo i ii iii iv v vi 1 2 3 4 5 primer primero segundo segunda tercer tercero cuarto final parcial parciales examen examenes quiz quices previo evaluacion sustentacion prueba test seguimiento semestre corte grupo tema temas unidad'.split(
    ' ',
  ),
)
const words = (s: string) =>
  new Set(
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9ñ]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      // "bioquímica" y "bioquimicas", "anatomía" y "anatomicas": se comparan por la raíz
      .map((w) => w.slice(0, 7)),
  )
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length

/**
 * Fuentes de la materia del parcial: primero una carpeta cuyo nombre coincida ("Parcial Bioquímica" → carpeta
 * "BIOQUÍMICA SEMESTRE 2"); si no, las fuentes cuyo título comparta palabras con el del parcial.
 */
export async function matchSources(title: string, profile = currentProfile()): Promise<string[]> {
  const t = words(title)
  if (!t.size) return []
  const cols = await db.select().from(collections).where(eq(collections.profile, profile))
  let best: { id: string; score: number } | null = null
  for (const c of cols) {
    const score = overlap(t, words(c.name))
    if (score > 0 && (!best || score > best.score)) best = { id: c.id, score }
  }
  const visible = await db
    .select({ id: sources.id, title: sources.title, originalName: sources.originalName })
    .from(sources)
    .where(and(eq(sources.status, 'ready'), inArray(sources.owner, visibleOwners(profile))))
  const ok = new Set(visible.map((s) => s.id))
  if (best) {
    const inside = await db.select({ id: collectionSources.sourceId }).from(collectionSources).where(eq(collectionSources.collectionId, best.id))
    const ids = inside.map((r) => r.id).filter((id) => ok.has(id))
    if (ids.length) return ids.slice(0, 12)
  }
  return visible
    .map((s) => ({ id: s.id, score: overlap(t, words(`${s.title} ${s.originalName ?? ''}`)) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((s) => s.id)
}

// ── Leer el calendario ───────────────────────────────────────

/** Solo enlaces públicos de internet (nada de direcciones internas) */
function checkUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.replace(/^webcal:\/\//i, 'https://'))
  } catch {
    throw new AppError(400, 'BAD_CALENDAR_URL', 'Ese enlace no se ve bien.')
  }
  const host = url.hostname.toLowerCase()
  const internal =
    /^(localhost|0\.0\.0\.0|\[?::1\]?)$/.test(host) ||
    /^(10|127)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  if (!/^https?:$/.test(url.protocol) || internal) throw new AppError(400, 'BAD_CALENDAR_URL', 'Ese enlace no se puede usar. Copia el enlace iCal del calendario.')
  return url
}

export async function fetchIcs(raw: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const url = checkUrl(raw)
  let res: Response
  try {
    res = await fetchImpl(url, { headers: { Accept: 'text/calendar, */*' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new AppError(502, 'CALENDAR_UNREACHABLE', 'No pude abrir el calendario. Revisa el enlace o tu internet e intenta de nuevo.')
  }
  if (!res.ok) throw new AppError(502, 'CALENDAR_HTTP', `El calendario respondió con error ${res.status}. ¿Copiaste el enlace privado (iCal)?`)
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new AppError(413, 'CALENDAR_TOO_BIG', 'Ese calendario es demasiado grande.')
  if (!text.includes('BEGIN:VCALENDAR')) throw new AppError(422, 'NOT_ICS', 'Ese enlace no es un calendario iCal. Busca la opción "dirección secreta en formato iCal" o "exportar calendario".')
  return text
}

/** Lee el calendario y guarda/actualiza los parciales que vienen. Devuelve cuántos encontró. */
export async function syncCalendar(profile = currentProfile(), fetchImpl: typeof fetch = fetch, now = new Date()): Promise<number> {
  const [feed] = await db.select().from(calendarFeeds).where(eq(calendarFeeds.profile, profile))
  if (!feed) return 0
  try {
    const events = parseIcs(await fetchIcs(feed.url, fetchImpl), env.APP_TIMEZONE).filter(
      (e) =>
        !e.cancelled &&
        looksLikeExam(e.summary) &&
        e.start.getTime() > now.getTime() - DAY &&
        e.start.getTime() < now.getTime() + HORIZON_DAYS * DAY,
    )
    const existing = await db.select().from(examEvents).where(and(eq(examEvents.profile, profile), eq(examEvents.origin, 'calendar')))
    const byUid = new Map(existing.map((e) => [e.uid, e]))
    for (const e of events) {
      const prev = byUid.get(e.uid)
      const sourceIds = prev?.sourcesLocked ? prev.sourceIds : await matchSources(e.summary, profile)
      const values = { title: e.summary.slice(0, 160), startsAt: e.start, allDay: e.allDay, sourceIds }
      if (prev) {
        // si cambió la fecha, los avisos vuelven a empezar
        const moved = prev.startsAt.getTime() !== e.start.getTime()
        await db
          .update(examEvents)
          .set({ ...values, ...(moved ? { notified: [] } : {}) })
          .where(eq(examEvents.id, prev.id))
      } else await db.insert(examEvents).values({ profile, uid: e.uid, origin: 'calendar', ...values }).onConflictDoNothing()
    }
    // los que ya no están en el calendario (los borró o los movieron a otro) se quitan si aún no pasan
    const seen = new Set(events.map((e) => e.uid))
    const gone = existing.filter((e) => !seen.has(e.uid) && e.startsAt.getTime() > now.getTime()).map((e) => e.id)
    if (gone.length) await db.delete(examEvents).where(inArray(examEvents.id, gone))
    await db.update(calendarFeeds).set({ lastSyncedAt: now, lastError: null }).where(eq(calendarFeeds.profile, profile))
    return events.length
  } catch (err) {
    const msg = err instanceof AppError ? err.message : 'No pude leer el calendario.'
    await db.update(calendarFeeds).set({ lastSyncedAt: now, lastError: msg }).where(eq(calendarFeeds.profile, profile))
    throw err
  }
}

export async function connectCalendar(url: string, fetchImpl: typeof fetch = fetch): Promise<CalendarDTO> {
  // se valida leyéndolo antes de guardarlo
  await fetchIcs(url, fetchImpl)
  const profile = currentProfile()
  await db.insert(calendarFeeds).values({ profile, url }).onConflictDoUpdate({ target: calendarFeeds.profile, set: { url, lastError: null } })
  await syncCalendar(profile, fetchImpl)
  return getCalendar(fetchImpl, false)
}

export async function disconnectCalendar(): Promise<CalendarDTO> {
  const profile = currentProfile()
  await db.delete(calendarFeeds).where(eq(calendarFeeds.profile, profile))
  // los que vinieron del calendario se van; los que agregó a mano se quedan
  await db.delete(examEvents).where(and(eq(examEvents.profile, profile), eq(examEvents.origin, 'calendar')))
  return getCalendar(fetch, false)
}

// ── Lo que ve la app ─────────────────────────────────────────

const hint = (url: string) => {
  try {
    const u = new URL(url)
    return `${u.hostname}/…${u.pathname.slice(-6)}`
  } catch {
    return 'calendario'
  }
}

export const toExamDTO = (e: ExamEvent, now = new Date()): ExamEventDTO => ({
  id: e.id,
  title: e.title,
  startsAt: e.startsAt.toISOString(),
  allDay: e.allDay,
  origin: e.origin,
  daysLeft: daysUntil(e.startsAt, now),
  sourceIds: e.sourceIds,
})

/** Parciales de hoy en adelante (sin los marcados "no es un parcial") */
export async function upcomingExams(profile = currentProfile(), now = new Date()): Promise<ExamEvent[]> {
  const startOfToday = new Date(now.getTime() - DAY)
  const rows = await db
    .select()
    .from(examEvents)
    .where(and(eq(examEvents.profile, profile), eq(examEvents.hidden, false), gte(examEvents.startsAt, startOfToday)))
    .orderBy(asc(examEvents.startsAt))
  return rows.filter((e) => daysUntil(e.startsAt, now) >= 0)
}

export async function getCalendar(fetchImpl: typeof fetch = fetch, resync = true): Promise<CalendarDTO> {
  const profile = currentProfile()
  let [feed] = await db.select().from(calendarFeeds).where(eq(calendarFeeds.profile, profile))
  // al abrir la pantalla, si hace rato no se lee, se lee de nuevo (si falla, se muestra lo último)
  if (resync && feed && (!feed.lastSyncedAt || Date.now() - feed.lastSyncedAt.getTime() > RESYNC_MS)) {
    await syncCalendar(profile, fetchImpl).catch(() => {})
    ;[feed] = await db.select().from(calendarFeeds).where(eq(calendarFeeds.profile, profile))
  }
  const [stats] = await db.select({ dailyFacts: userStats.dailyFacts }).from(userStats).where(eq(userStats.id, statsIdFor(profile)))
  return {
    feed: {
      connected: !!feed,
      hint: feed ? hint(feed.url) : null,
      lastSyncedAt: feed?.lastSyncedAt?.toISOString() ?? null,
      error: feed?.lastError ?? null,
    },
    exams: (await upcomingExams(profile)).map((e) => toExamDTO(e)),
    dailyFacts: stats?.dailyFacts ?? true,
  }
}

// ── Parciales a mano y ajustes ───────────────────────────────

async function checkSources(ids: string[]) {
  if (!ids.length) return []
  const ok = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(inArray(sources.id, ids), inArray(sources.owner, visibleOwners())))
  return ids.filter((id) => ok.some((o) => o.id === id))
}

export async function addManualExam(input: { title: string; date: string; time?: string; sourceIds: string[] }): Promise<ExamEventDTO> {
  const [y, m, d] = input.date.split('-').map(Number) as [number, number, number]
  const [h, mi] = input.time ? (input.time.split(':').map(Number) as [number, number]) : [12, 0]
  const startsAt = zonedTime(y, m, d, h, mi, 0, env.APP_TIMEZONE)
  if (daysUntil(startsAt) < 0) throw new AppError(400, 'PAST_DATE', 'Esa fecha ya pasó.')
  const chosen = await checkSources(input.sourceIds)
  const sourceIds = chosen.length ? chosen : await matchSources(input.title)
  const id = crypto.randomUUID()
  const [row] = await db
    .insert(examEvents)
    .values({
      id,
      profile: currentProfile(),
      uid: `manual:${id}`,
      origin: 'manual',
      title: input.title,
      startsAt,
      allDay: !input.time,
      sourceIds,
      sourcesLocked: chosen.length > 0,
    })
    .returning()
  return toExamDTO(row!)
}

async function ownExam(id: string) {
  const [row] = await db
    .select()
    .from(examEvents)
    .where(and(eq(examEvents.id, id), eq(examEvents.profile, currentProfile())))
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Ese parcial no existe.')
  return row
}

export async function updateExam(id: string, patch: { sourceIds?: string[]; hidden?: boolean }): Promise<ExamEventDTO> {
  await ownExam(id)
  const set: Partial<ExamEvent> = {}
  if (patch.sourceIds) Object.assign(set, { sourceIds: await checkSources(patch.sourceIds), sourcesLocked: true })
  if (patch.hidden !== undefined) set.hidden = patch.hidden
  const [row] = await db.update(examEvents).set(set).where(eq(examEvents.id, id)).returning()
  return toExamDTO(row!)
}

export async function deleteExam(id: string) {
  const row = await ownExam(id)
  // los del calendario volverían en la próxima lectura: se esconden en vez de borrarse
  if (row.origin === 'calendar') await db.update(examEvents).set({ hidden: true }).where(eq(examEvents.id, id))
  else await db.delete(examEvents).where(eq(examEvents.id, id))
}

export async function setDailyFacts(on: boolean) {
  await getStatsRow()
  await db.update(userStats).set({ dailyFacts: on }).where(eq(userStats.id, statsIdFor()))
}
