// Lector mínimo de calendarios iCal (.ics): lo que exportan Google Calendar, Outlook, Apple y Moodle.
// Solo lo que hace falta para encontrar parciales: UID, título, descripción, inicio (con zona horaria o de todo el día)
// y si se repite. Sin dependencias.

export interface IcsEvent {
  uid: string
  summary: string
  description: string
  start: Date
  allDay: boolean
  recurring: boolean
  cancelled: boolean
}

/** Las líneas largas vienen partidas: una línea que empieza con espacio o tab continúa la anterior */
const unfold = (text: string) => text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')

const unescape = (s: string) =>
  s
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .trim()

/** Minutos que hay que sumar a la hora local de `timeZone` para pasarla a UTC en ese instante */
function offsetMinutes(utcGuess: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(utcGuess)
      .map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!)
  return (utcGuess.getTime() - asUtc) / 60_000
}

/** Fecha y hora "de pared" en una zona → instante UTC */
export function zonedTime(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, s))
  let validZone = true
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
  } catch {
    validZone = false
  }
  if (!validZone) return guess
  // dos pasadas por si el cambio de horario cae cerca (en Colombia no hay, pero en otros calendarios sí)
  const first = new Date(guess.getTime() + offsetMinutes(guess, timeZone) * 60_000)
  return new Date(guess.getTime() + offsetMinutes(first, timeZone) * 60_000)
}

/** DTSTART con sus parámetros → instante. Los de todo el día quedan al mediodía de ese día en la zona de la app. */
export function parseIcsDate(value: string, params: Record<string, string>, fallbackZone: string): { date: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (params.VALUE === 'DATE' || h === undefined) return { date: zonedTime(+y!, +mo!, +d!, 12, 0, 0, fallbackZone), allDay: true }
  if (z) return { date: new Date(Date.UTC(+y!, +mo! - 1, +d!, +h, +mi!, +(s ?? 0))), allDay: false }
  // TZID de Windows/Outlook a veces viene con comillas o con nombres raros: si no se reconoce, la de la app
  const tz = (params.TZID ?? '').replace(/^"|"$/g, '') || fallbackZone
  return { date: zonedTime(+y!, +mo!, +d!, +h, +mi!, +(s ?? 0), tz), allDay: false }
}

export function parseIcs(text: string, fallbackZone: string): IcsEvent[] {
  const events: IcsEvent[] = []
  let cur: Partial<IcsEvent> & { inEvent?: boolean } = {}
  let depth = 0 // VALARM y otros bloques dentro del evento
  for (const raw of unfold(text).split('\n')) {
    const line = raw.trimEnd()
    if (!line) continue
    if (line === 'BEGIN:VEVENT') {
      cur = { inEvent: true, uid: '', summary: '', description: '', recurring: false, cancelled: false }
      depth = 0
      continue
    }
    if (!cur.inEvent) continue
    if (line.startsWith('BEGIN:')) {
      depth++
      continue
    }
    if (line.startsWith('END:') && line !== 'END:VEVENT') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur.start && (cur.uid || cur.summary)) events.push({ ...(cur as IcsEvent), uid: cur.uid || `${cur.summary}@${cur.start.toISOString()}` })
      cur = {}
      continue
    }
    if (depth > 0) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const [name, ...paramParts] = line.slice(0, colon).split(';')
    const value = line.slice(colon + 1)
    const params = Object.fromEntries(
      paramParts.map((p) => {
        const [k, ...v] = p.split('=')
        return [k!.toUpperCase(), v.join('=')]
      }),
    )
    switch (name!.toUpperCase()) {
      case 'UID':
        cur.uid = value.trim()
        break
      case 'SUMMARY':
        cur.summary = unescape(value)
        break
      case 'DESCRIPTION':
        cur.description = unescape(value).slice(0, 2000)
        break
      case 'DTSTART': {
        const d = parseIcsDate(value, params, fallbackZone)
        if (d) {
          cur.start = d.date
          cur.allDay = d.allDay
        }
        break
      }
      case 'RRULE':
        cur.recurring = true
        break
      case 'STATUS':
        cur.cancelled = value.trim().toUpperCase() === 'CANCELLED'
        break
    }
  }
  return events
}

/** ¿Es una evaluación? Parciales, quices, exámenes, sustentaciones, previos… (no clases ni entregas comunes) */
const EXAM_WORDS =
  /\b(parcial(es)?|ex[aá]men(es)?|quiz(z?es)?|quices|previo|evaluaci[oó]n|sustentaci[oó]n|prueba (escrita|oral|pr[aá]ctica)|final(es)?|supletorio|habilitaci[oó]n|test|seguimiento)\b/i
const NOT_EXAM = /\b(clase|reuni[oó]n|asesor[ií]a|tutor[ií]a|cumplea[ñn]os|entrega de notas|publicaci[oó]n de notas|inscripci[oó]n|matr[ií]cula)\b/i
export const looksLikeExam = (title: string) => EXAM_WORDS.test(title) && !NOT_EXAM.test(title)
