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

// nombres con tilde o distintos al del código
const DISPLAY_NAMES: Record<string, string> = { mama: 'Mamá' }

export function displayNameFor(profile = currentProfile()): string {
  if (profile === OWNER) return env.OWNER_NAME
  return DISPLAY_NAMES[profile] ?? profile.charAt(0).toUpperCase() + profile.slice(1)
}

/** Invitadas que pueden estudiar con las fuentes de Ash (las demás, p. ej. Mamá, solo ven las suyas) */
const SEES_OWNER_SOURCES = new Set(['magola'])

/** Fuentes que ve: la dueña, las suyas; Magola, las de Ash y las propias; el resto, solo las propias */
export const visibleOwners = (profile = currentProfile()) =>
  profile === OWNER ? [OWNER] : SEES_OWNER_SOURCES.has(profile) ? [OWNER, profile] : [profile]

/**
 * Huella de una fuente para no repetirla: Ash y Magola comparten (si ya está, se reutiliza);
 * una invitada aparte (Mamá) tiene su propia copia, que Ash nunca ve.
 */
export const scopedHash = (hash: string, profile = currentProfile()) =>
  profile === OWNER || SEES_OWNER_SOURCES.has(profile) ? hash : `${profile}:${hash}`
