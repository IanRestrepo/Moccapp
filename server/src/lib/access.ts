// Código de acceso para cuando la app está en internet. Sin ACCESS_CODE (local) no hace nada.
// Se escribe una vez por dispositivo; queda una cookie httpOnly de 1 año.
import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, RequestHandler, Response } from 'express'
import { z } from 'zod'
import { env } from '../env.js'
import { AppError } from './errors.js'
import { OWNER, displayNameFor, isOwner, runAs } from './profile.js'

const COOKIE = 'vq_access'
const ONE_YEAR = 365 * 24 * 3600

/** El token depende del código: si ella cambia ACCESS_CODE, todos los dispositivos tienen que volver a entrar */
const tokenFor = (code: string) => createHash('sha256').update(`vetquiz-access:${code}`).digest('hex')

const sameToken = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

/** Códigos válidos para entrar: con PROFILE_CODES, uno por perfil; si no, ACCESS_CODE es de la dueña */
const loginCodes = () => (env.PROFILE_CODES.length ? env.PROFILE_CODES : env.ACCESS_CODE ? [{ name: OWNER, code: env.ACCESS_CODE }] : [])
export const accessEnabled = () => loginCodes().length > 0
const profileToken = (name: string, code: string) => `${name}.${tokenFor(`${name}:${code}`)}`

/** Perfil de quien hace la petición, o null si no tiene acceso */
export function profileOf(req: Request): string | null {
  if (!accessEnabled()) return OWNER
  const cookie = readCookie(req, COOKIE)
  if (!cookie) return null
  // dispositivos que entraron antes de los perfiles (con ACCESS_CODE): siguen siendo de la dueña
  if (env.ACCESS_CODE && sameToken(cookie, tokenFor(env.ACCESS_CODE))) return OWNER
  const name = cookie.split('.')[0]!
  const p = loginCodes().find((x) => x.name === name)
  return p && sameToken(cookie, profileToken(p.name, p.code)) ? p.name : null
}

/** Protege toda la API excepto salud y la propia entrada; el resto de la petición corre como ese perfil */
export const requireAccess: RequestHandler = (req, _res, next) => {
  const profile = profileOf(req)
  if (profile) return runAs(profile, next)
  if (req.path === '/health' || req.path === '/access') return next()
  next(new AppError(401, 'ACCESS_REQUIRED', 'Escribe tu código de acceso para entrar.'))
}

/** Huesitos y premios son solo de la dueña */
export const requireOwner: RequestHandler = (_req, _res, next) => {
  if (isOwner()) return next()
  next(new AppError(403, 'OWNER_ONLY', 'Esta parte es solo para Ash.'))
}

// Freno simple contra adivinar el código: 10 intentos fallidos cada 10 minutos por IP
const attempts = new Map<string, { n: number; until: number }>()

function statusFor(profile: string | null) {
  return {
    required: accessEnabled(),
    granted: !!profile,
    profile,
    owner: profile === OWNER,
    name: profile ? displayNameFor(profile) : null,
    /** en Vercel los archivos se suben directo a Vercel Blob */
    blobUploads: !!env.BLOB_READ_WRITE_TOKEN,
  }
}

export function accessStatus(req: Request, res: Response) {
  res.json(statusFor(profileOf(req)))
}

export function enterAccess(req: Request, res: Response) {
  const ip = req.ip ?? 'unknown'
  const now = Date.now()
  const a = attempts.get(ip)
  if (a && a.until > now && a.n >= 10) throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Espera unos minutos.')

  const { code } = z.object({ code: z.string().trim().min(1).max(200) }).parse(req.body)
  const match = loginCodes().find((p) => sameToken(tokenFor(code), tokenFor(p.code)))
  if (!match) {
    attempts.set(ip, { n: (a && a.until > now ? a.n : 0) + 1, until: now + 10 * 60_000 })
    throw new AppError(401, 'WRONG_CODE', 'Ese código no es. Revisa mayúsculas y espacios.')
  }
  attempts.delete(ip)
  res.cookie(COOKIE, profileToken(match.name, match.code), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: ONE_YEAR * 1000,
    path: '/',
  })
  res.json(statusFor(match.name))
}

// ── Administrador (página de premios) ────────────────────────
// En local sin ADMIN_CODE queda abierta; en producción sin ADMIN_CODE queda deshabilitada
// (si no, Ashley podría regalarse huesitos 😄).

const ADMIN_COOKIE = 'vq_admin'
const adminToken = (code: string) => createHash('sha256').update(`vetquiz-admin:${code}`).digest('hex')

export function isAdmin(req: Request): boolean {
  if (!env.ADMIN_CODE) return env.NODE_ENV !== 'production'
  const cookie = readCookie(req, ADMIN_COOKIE)
  return !!cookie && sameToken(cookie, adminToken(env.ADMIN_CODE))
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (isAdmin(req)) return next()
  if (!env.ADMIN_CODE && env.NODE_ENV === 'production')
    return next(new AppError(403, 'ADMIN_DISABLED', 'La página de administrador está apagada: configura ADMIN_CODE.'))
  next(new AppError(401, 'ADMIN_REQUIRED', 'Escribe el código de administrador.'))
}

export function adminStatus(req: Request, res: Response) {
  res.json({ required: !!env.ADMIN_CODE, granted: isAdmin(req), disabled: !env.ADMIN_CODE && env.NODE_ENV === 'production' })
}

export function enterAdmin(req: Request, res: Response) {
  const ip = `admin:${req.ip ?? 'unknown'}`
  const now = Date.now()
  const a = attempts.get(ip)
  if (a && a.until > now && a.n >= 10) throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Espera unos minutos.')
  const { code } = z.object({ code: z.string().trim().min(1).max(200) }).parse(req.body)
  if (!env.ADMIN_CODE || !sameToken(adminToken(code), adminToken(env.ADMIN_CODE))) {
    attempts.set(ip, { n: (a && a.until > now ? a.n : 0) + 1, until: now + 10 * 60_000 })
    throw new AppError(401, 'WRONG_CODE', 'Ese código de administrador no es.')
  }
  attempts.delete(ip)
  res.cookie(ADMIN_COOKIE, adminToken(env.ADMIN_CODE), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: ONE_YEAR * 1000,
    path: '/',
  })
  res.json({ required: true, granted: true, disabled: false })
}
