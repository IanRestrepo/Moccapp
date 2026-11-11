// Textos de los parciales del calendario (cuántos días faltan, fecha corta)
import type { ExamEventDTO } from '@vetquiz/shared'

const TZ = 'America/Bogota'
export const countdown = (e: Pick<ExamEventDTO, 'daysLeft'>) =>
  e.daysLeft === 0 ? 'Hoy' : e.daysLeft === 1 ? 'Mañana' : e.daysLeft < 7 ? `En ${e.daysLeft} días` : e.daysLeft < 14 ? 'En una semana' : `En ${Math.round(e.daysLeft / 7)} semanas`
export const dayNum = (iso: string) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, day: 'numeric' }).format(new Date(iso))
export const monthShort = (iso: string) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, month: 'short' }).format(new Date(iso)).replace('.', '')
export const weekday = (iso: string) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, weekday: 'long' }).format(new Date(iso))
export const hour = (iso: string) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
/** Color según qué tan cerca está */
export const urgency = (e: Pick<ExamEventDTO, 'daysLeft'>) => (e.daysLeft <= 1 ? 'bg-pink' : e.daysLeft <= 3 ? 'bg-orange' : e.daysLeft <= 7 ? 'bg-yellow' : 'bg-sky')
/** "sábado 14 de nov · 8:00 a. m." con solo la primera letra en mayúscula */
export const whenText = (e: Pick<ExamEventDTO, 'startsAt' | 'allDay'>) => {
  const t = `${weekday(e.startsAt)} ${dayNum(e.startsAt)} de ${monthShort(e.startsAt)}${e.allDay ? '' : ` · ${hour(e.startsAt)}`}`
  return t.charAt(0).toUpperCase() + t.slice(1)
}
