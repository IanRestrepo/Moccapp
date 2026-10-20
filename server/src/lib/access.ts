// Código de acceso para cuando la app está en internet. Sin ACCESS_CODE (local) no hace nada.
// Se escribe una vez por dispositivo; queda una cookie httpOnly de 1 año.
import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, RequestHandler, Response } from 'express'
import { z } from 'zod'
import { env } from '../env.js'
import { AppError } from './errors.js'

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

export const accessEnabled = () => Boolean(env.ACCESS_CODE)
const hasAccess = (req: Request) => {
  if (!env.ACCESS_CODE) return true
  const cookie = readCookie(req, COOKIE)
  return !!cookie && sameToken(cookie, tokenFor(env.ACCESS_CODE))
}

/** Protege toda la API excepto salud y la propia entrada */
export const requireAccess: RequestHandler = (req, _res, next) => {
  if (req.path === '/health' || req.path === '/access' || hasAccess(req)) return next()
  next(new AppError(401, 'ACCESS_REQUIRED', 'Escribe tu código de acceso para entrar.'))
}

// Freno simple contra adivinar el código: 10 intentos fallidos cada 10 minutos por IP
const attempts = new Map<string, { n: number; until: number }>()

export function accessStatus(req: Request, res: Response) {
  res.json({ required: accessEnabled(), granted: hasAccess(req) })
}

export function enterAccess(req: Request, res: Response) {
  const ip = req.ip ?? 'unknown'
  const now = Date.now()
  const a = attempts.get(ip)
  if (a && a.until > now && a.n >= 10)
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Espera unos minutos.')

  const { code } = z.object({ code: z.string().trim().min(1).max(200) }).parse(req.body)
  if (!env.ACCESS_CODE || !sameToken(tokenFor(code), tokenFor(env.ACCESS_CODE))) {
    attempts.set(ip, { n: (a && a.until > now ? a.n : 0) + 1, until: now + 10 * 60_000 })
    throw new AppError(401, 'WRONG_CODE', 'Ese código no es. Revisa mayúsculas y espacios.')
  }
  attempts.delete(ip)
  res.cookie(COOKIE, tokenFor(env.ACCESS_CODE), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: ONE_YEAR * 1000,
    path: '/',
  })
  res.json({ required: true, granted: true })
}

// ── Administrador (página de premios) ────────────────────────
// En local sin ADMIN_CODE queda abierta; en producción sin ADMIN_CODE queda deshabilitada
// (si no, Ashley podría regalarse huesitos 😄).

const ADMIN_COOKIE = 'vq_admin'
const adminToken = (code: string) => createHash('sha256').update(`vetquiz-admin:${code}`).digest('hex')

function isAdmin(req: Request): boolean {
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
