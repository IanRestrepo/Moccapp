// Perfiles: la app es de Ash (la dueña) y puede invitar a otras personas con su propio código.
// Cada petición corre "como" un perfil (AsyncLocalStorage): los servicios preguntan currentProfile() sin
// pasar el perfil por todas partes. Fuera de una petición (trabajos en segundo plano, pruebas) es la dueña.
import { AsyncLocalStorage } from 'node:async_hooks'
import { env } from '../env.js'

export const OWNER = 'ash'
const store = new AsyncLocalStorage<string>()

/** Perfiles conocidos, en orden; el índice + 1 es su fila en user_stats (la dueña es la 1, la de siempre) */
export const profileNames = (): string[] => {
  const extra = env.PROFILE_CODES.map((p) => p.name).filter((n) => n !== OWNER)
  return [OWNER, ...extra]
}
export const currentProfile = () => store.getStore() ?? OWNER
export const isOwner = (p = currentProfile()) => p === OWNER
export const runAs = <T>(profile: string, fn: () => T) => store.run(profile, fn)

export function statsIdFor(profile = currentProfile()): number {
  const i = profileNames().indexOf(profile)
  return i === -1 ? 1 : i + 1
}

export function displayNameFor(profile = currentProfile()): string {
  if (profile === OWNER) return env.OWNER_NAME
  return profile.charAt(0).toUpperCase() + profile.slice(1)
}

/** Fuentes que ve: la dueña ve las suyas; las invitadas ven las de la dueña y las propias */
export const visibleOwners = (profile = currentProfile()) => (profile === OWNER ? [OWNER] : [OWNER, profile])
