// Formatos en español de Colombia.

const dayFmt = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
const shortFmt = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Lunes, 19 de octubre" */
export const longDate = (d = new Date()) => cap(dayFmt.format(d))

/** "Hoy", "Ayer" o "12 oct." */
export function relativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  return shortFmt.format(d)
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Letra corta del día para la semana: "Lu", "Ma"… */
export function weekdayShort(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`)
  return cap(new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(d).replace('.', '').slice(0, 2))
}

/** "26 min", "1 h 05 min", "45 s" */
export function duration(sec: number): string {
  if (sec < 60) return `${sec} s`
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

/** Reloj del cronómetro: "18:24" o "1:02:03" */
export function clock(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Nota con coma decimal, como en Colombia: 4,3 */
export const scoreText = (n: number) => n.toFixed(1).replace('.', ',')

/** Fondo según la nota: menta ≥ 4, amarillo ≥ 3, rosa < 3 */
export const scoreBg = (n: number) => (n >= 4 ? 'bg-mint' : n >= 3 ? 'bg-yellow' : 'bg-pink')
