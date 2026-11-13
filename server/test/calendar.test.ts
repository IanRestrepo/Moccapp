// Calendario de la U: leer el iCal, encontrar parciales, ligarlos con sus fuentes y avisar días antes.
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { CalendarDTO, ExamEventDTO } from '@vetquiz/shared'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), 'vetquiz-cal-'))
process.env.APP_TIMEZONE = 'America/Bogota'

const { parseIcs, looksLikeExam, zonedTime } = await import('../src/services/ical.js')
const cal = await import('../src/services/calendar.js')
const reminders = await import('../src/services/reminders.js')
const { createApp } = await import('../src/app.js')
const { db, closeDb } = await import('../src/db/client.js')
const schema = await import('../src/db/schema.js')
const { eq } = await import('drizzle-orm')

let base = ''
let server: import('node:http').Server
before(async () => {
  server = createApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})
after(async () => {
  server.close()
  await closeDb()
})
const api = async <T>(method: string, url: string, body?: unknown) => {
  const res = await fetch(`${base}${url}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, body: (res.status === 204 ? null : await res.json()) as T }
}

// la fecha en hora de Colombia (en UTC, después de las 7 p. m. ya sería mañana)
const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).replace(/-/g, '')
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000)
/** Un calendario como el que exporta Google: con zona horaria, uno de todo el día, una clase que se repite y una alarma */
const ics = (extra = '') =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:parcial-bioq@google.com',
    `DTSTART;TZID=America/Bogota:${ymd(inDays(3))}T080000`,
    'SUMMARY:Parcial 2 de Bioquímica',
    'DESCRIPTION:Temas: enzimas\\, metabolismo',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'SUMMARY:Alarma que no es el evento',
    'END:VALARM',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:quiz-anato@google.com',
    `DTSTART;VALUE=DATE:${ymd(inDays(7))}`,
    // línea partida: el primer espacio es el de la partición, el segundo es del texto
    'SUMMARY:Quiz de anatomía',
    '  veterinaria',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:clase@google.com',
    `DTSTART:${ymd(inDays(1))}T130000Z`,
    'RRULE:FREQ=WEEKLY',
    'SUMMARY:Clase de Bioquímica',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:cancelado@google.com',
    `DTSTART:${ymd(inDays(5))}T130000Z`,
    'STATUS:CANCELLED',
    'SUMMARY:Examen cancelado',
    'END:VEVENT',
    extra,
    'END:VCALENDAR',
  ].join('\r\n')

let served = ics()
const fakeFetch = (async (url: URL) => {
  if (String(url).includes('roto')) return new Response('nope', { status: 404 })
  if (String(url).includes('pagina')) return new Response('<html>hola</html>')
  return new Response(served)
}) as unknown as typeof fetch

test('lee el iCal: zona horaria, todo el día, líneas partidas, alarmas y repeticiones', () => {
  const ev = parseIcs(ics(), 'America/Bogota')
  assert.equal(ev.length, 4)
  const bioq = ev.find((e) => e.uid === 'parcial-bioq@google.com')!
  assert.equal(bioq.summary, 'Parcial 2 de Bioquímica')
  assert.equal(bioq.description, 'Temas: enzimas, metabolismo')
  // 8 a. m. en Bogotá = 13:00 UTC
  assert.equal(bioq.start.getUTCHours(), 13)
  assert.equal(bioq.allDay, false)
  const quiz = ev.find((e) => e.uid === 'quiz-anato@google.com')!
  assert.equal(quiz.summary, 'Quiz de anatomía veterinaria')
  assert.equal(quiz.allDay, true)
  assert.equal(ev.find((e) => e.uid === 'clase@google.com')!.recurring, true)
  assert.equal(ev.find((e) => e.uid === 'cancelado@google.com')!.cancelled, true)
  assert.equal(zonedTime(2026, 11, 20, 8, 0, 0, 'America/Bogota').toISOString(), '2026-11-20T13:00:00.000Z')
})

test('reconoce parciales y no clases', () => {
  for (const t of ['Parcial 2 de Bioquímica', 'Quiz de anatomía', 'EXAMEN FINAL Fisiología', 'Sustentación proyecto', 'Previo de histología', 'Supletorio'])
    assert.ok(looksLikeExam(t), t)
  for (const t of ['Clase de Bioquímica', 'Asesoría parcial', 'Cumpleaños de Ian', 'Reunión de grupo', 'Publicación de notas del examen'])
    assert.ok(!looksLikeExam(t), t)
})

test('conectar: guarda los parciales, los liga a la carpeta de la materia y no muestra el enlace completo', async () => {
  // una carpeta "BIOQUÍMICA SEMESTRE 2" con una fuente lista, y una fuente suelta de anatomía
  const [s1] = await db.insert(schema.sources).values({ title: 'Enzimas y cinética', kind: 'text', color: 'mint', contentHash: 'b1', status: 'ready', owner: 'ash' }).returning()
  const [s2] = await db.insert(schema.sources).values({ title: 'Anatomía del miembro torácico', kind: 'text', color: 'sky', contentHash: 'a1', status: 'ready', owner: 'ash' }).returning()
  const [col] = await db.insert(schema.collections).values({ profile: 'ash', name: 'BIOQUÍMICA SEMESTRE 2', color: 'mint' }).returning()
  await db.insert(schema.collectionSources).values({ collectionId: col!.id, sourceId: s1!.id })

  const { runAs } = await import('../src/lib/profile.js')
  const res = await runAs('ash', () => cal.connectCalendar('webcal://calendar.google.com/calendar/ical/privado/basic.ics', fakeFetch))
  assert.equal(res.feed.connected, true)
  assert.ok(!res.feed.hint!.includes('privado'))
  assert.deepEqual(
    res.exams.map((e) => [e.title, e.daysLeft]),
    [
      ['Parcial 2 de Bioquímica', 3],
      ['Quiz de anatomía veterinaria', 7],
    ],
  )
  assert.deepEqual(res.exams[0]!.sourceIds, [s1!.id])
  assert.deepEqual(res.exams[1]!.sourceIds, [s2!.id])
})

test('enlaces que no sirven: con error claro y sin guardar nada', async () => {
  const { runAs } = await import('../src/lib/profile.js')
  await assert.rejects(runAs('magola', () => cal.connectCalendar('https://ejemplo.com/roto.ics', fakeFetch)), /error 404/)
  await assert.rejects(runAs('magola', () => cal.connectCalendar('https://ejemplo.com/pagina', fakeFetch)), /no es un calendario/)
  await assert.rejects(runAs('magola', () => cal.connectCalendar('http://127.0.0.1/cal.ics', fakeFetch)), /no se puede usar/)
  const c = await runAs('magola', () => cal.getCalendar(fakeFetch, false))
  assert.equal(c.feed.connected, false)
})

test('al volver a leer: si movieron la fecha se actualiza y los que ya no están se quitan', async () => {
  served = ics().replace('Parcial 2 de Bioquímica', 'Parcial 2 de Bioquímica (aplazado)').replace(`DTSTART;VALUE=DATE:${ymd(inDays(7))}`, `DTSTART;VALUE=DATE:${ymd(inDays(9))}`)
  served = served.replace(/BEGIN:VEVENT\r\nUID:parcial-bioq[\s\S]*?END:VEVENT\r\n/, '')
  await cal.syncCalendar('ash', fakeFetch)
  const rows = await db.select().from(schema.examEvents).where(eq(schema.examEvents.profile, 'ash'))
  assert.deepEqual(
    rows.map((r) => r.uid),
    ['quiz-anato@google.com'],
  )
  assert.equal(cal.daysUntil(rows[0]!.startsAt), 9)
  served = ics()
  await cal.syncCalendar('ash', fakeFetch)
})

test('parciales a mano, elegir sus fuentes y "no es un parcial"', async () => {
  const date = new Date(Date.now() + 2 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const created = await api<{ exam: ExamEventDTO }>('POST', '/calendar/exams', { title: 'Examen de Fisiología', date, time: '10:00' })
  assert.equal(created.status, 201)
  assert.equal(created.body.exam.daysLeft, 2)
  assert.equal(created.body.exam.origin, 'manual')
  assert.equal((await api('POST', '/calendar/exams', { title: 'Viejo', date: '2020-01-01' })).status, 400)

  const list = (await api<CalendarDTO>('GET', '/calendar')).body
  assert.deepEqual(
    list.exams.map((e) => e.title),
    ['Examen de Fisiología', 'Parcial 2 de Bioquímica', 'Quiz de anatomía veterinaria'],
  )
  const quiz = list.exams.find((e) => e.title.startsWith('Quiz'))!
  // elegir fuentes a mano: ya no las cambia la siguiente lectura
  const bioq = list.exams.find((e) => e.title.startsWith('Parcial'))!
  await api('PATCH', `/calendar/exams/${quiz.id}`, { sourceIds: bioq.sourceIds })
  await cal.syncCalendar('ash', fakeFetch)
  const again = (await api<CalendarDTO>('GET', '/calendar')).body.exams.find((e) => e.id === quiz.id)!
  assert.deepEqual(again.sourceIds, bioq.sourceIds)
  // borrar uno del calendario lo esconde (no vuelve al leer de nuevo)
  assert.equal((await api('DELETE', `/calendar/exams/${quiz.id}`)).status, 204)
  await cal.syncCalendar('ash', fakeFetch)
  assert.ok(!(await api<CalendarDTO>('GET', '/calendar')).body.exams.some((e) => e.id === quiz.id))
})

test('avisos: el parcial a 2 o 3 días se avisa una sola vez; el día del parcial, en la mañana', async () => {
  // parcial de bioquímica a 3 días: hoy toca aviso
  const night1 = await reminders.sendDailyReminders()
  const ash1 = night1.find((r) => r.profile === 'ash')!
  assert.equal(ash1.kind, 'parcial en 2 días')
  // el manual de fisiología (a 2 días) va primero por ser el más cercano; el de bioquímica sigue pendiente
  const night2 = await reminders.sendDailyReminders()
  assert.equal(night2.find((r) => r.profile === 'ash')!.kind, 'parcial en 3 días')
  // la misma noche otra vez: ya no repite
  const night3 = await reminders.sendDailyReminders()
  assert.ok(!night3.find((r) => r.profile === 'ash')!.kind.startsWith('parcial'))

  // el día del parcial (simulado moviendo la hora "ahora" 3 días)
  const morning = await reminders.sendMorningNudges(new Date(Date.now() + 3 * 86_400_000))
  assert.equal(morning.find((r) => r.profile === 'ash')!.kind, 'parcial hoy')
  const morning2 = await reminders.sendMorningNudges(new Date(Date.now() + 3 * 86_400_000))
  assert.notEqual(morning2.find((r) => r.profile === 'ash')!.kind, 'parcial hoy')
})

test('textos de los avisos', () => {
  const e = { id: 'x', title: 'Parcial 2 de Bioquímica (Grupo 3)', sourceIds: ['s'] } as never
  assert.match(reminders.examNoticeText(e, 1, 'Ashley').title, /^📚 Mañana: Parcial 2 de Bioquímica$/)
  assert.match(reminders.examNoticeText(e, 7, 'Ashley').title, /una semana/)
  assert.match(reminders.examNoticeText(e, 3, 'Ashley').title, /Faltan 3 días/)
})

test('datos curiosos: de sus guías, y se pueden apagar', async () => {
  const [src] = await db.select().from(schema.sources).where(eq(schema.sources.contentHash, 'b1'))
  await db.insert(schema.studyGuides).values({
    sourceId: src!.id,
    status: 'ready',
    data: {
      version: 2,
      overview: '',
      checklist: [],
      conceptMap: { center: 'Enzimas', branches: [] },
      sections: [
        {
          title: 'Enzimas',
          location: '',
          summary: 'x',
          keyPoints: ['Las **enzimas** bajan la energía de activación sin consumirse en la reacción.'],
          terms: [],
          tables: [],
          tip: '',
          bankTopics: [],
          images: [],
        },
      ],
    },
  })
  const fact = await reminders.pickFact('ash', [src!.id])
  assert.equal(fact!.text, 'Las enzimas bajan la energía de activación sin consumirse en la reacción.')
  assert.equal(fact!.url, `/#/guia/${src!.id}`)

  await api('PUT', '/calendar/facts', { on: false })
  assert.equal((await api<CalendarDTO>('GET', '/calendar')).body.dailyFacts, false)
  const morning = await reminders.sendMorningNudges()
  assert.equal(morning.find((r) => r.profile === 'ash')!.kind, 'datos curiosos apagados')
})

test('el aviso de la mañana necesita la clave del cron', async () => {
  assert.equal((await fetch(`${base}/cron/morning`)).status, 401)
})
