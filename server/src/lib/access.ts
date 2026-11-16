// Entrada a la app cuando está en internet (sin códigos configurados, en local, no hace nada).
// Se entra con usuario y contraseña. La primera vez, cada persona entra con su código de siempre
// y crea su usuario y contraseña; desde ahí el código ya solo sirve para recuperar la contraseña.
// La sesión es una cookie httpOnly de 1 año.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Request, RequestHandler, Response } from 'express'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { accounts } from '../db/schema.js'
import { env } from '../env.js'
import { AppError } from './errors.js'
import { OWNER, displayNameFor, isOwner, runAs } from './profile.js'

const COOKIE = 'vq_access'
const ONE_YEAR = 365 * 24 * 3600
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

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

/** Códigos válidos: con PROFILE_CODES, uno por perfil; si no, ACCESS_CODE es de la dueña */
const loginCodes = () => (env.PROFILE_CODES.length ? env.PROFILE_CODES : env.ACCESS_CODE ? [{ name: OWNER, code: env.ACCESS_CODE }] : [])
export const accessEnabled = () => loginCodes().length > 0
const profileToken = (name: string, code: string) => `${name}.${tokenFor(`${name}:${code}`)}`

// ── contraseñas ──────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const got = await scrypt(password, Buffer.from(salt, 'hex'), 64)
  const want = Buffer.from(hash, 'hex')
  return got.length === want.length && timingSafeEqual(got, want)
}

/** Cookie de una cuenta: cambia si cambia la contraseña (así cambiarla saca a los demás dispositivos) */
const accountToken = (profile: string, passwordHash: string) =>
  `acct.${profile}.${createHash('sha256').update(`vetquiz-account:${profile}:${passwordHash}`).digest('hex')}`

const accountOf = async (profile: string) => (await db.select().from(accounts).where(eq(accounts.profile, profile)))[0] ?? null

type Who = { profile: string; viaCode: boolean } | null

/** Quién hace la petición. viaCode = entró con el código y todavía no tiene usuario */
async function whoIs(req: Request): Promise<Who> {
  if (!accessEnabled()) return { profile: OWNER, viaCode: false }
  const cookie = readCookie(req, COOKIE)
  if (!cookie) return null

  if (cookie.startsWith('acct.')) {
    const [, profile] = cookie.split('.')
    if (!profile || !loginCodes().some((p) => p.name === profile)) return null
    const acc = await accountOf(profile)
    return acc && sameToken(cookie, accountToken(profile, acc.passwordHash)) ? { profile, viaCode: false } : null
  }

  // entró con el código: vale solo mientras ese perfil no haya creado su usuario
  let profile: string | null = null
  // dispositivos que entraron antes de los perfiles (con ACCESS_CODE): son de la dueña
  if (env.ACCESS_CODE && sameToken(cookie, tokenFor(env.ACCESS_CODE))) profile = OWNER
  else {
    const name = cookie.split('.')[0]!
    const p = loginCodes().find((x) => x.name === name)
    if (p && sameToken(cookie, profileToken(p.name, p.code))) profile = p.name
  }
  if (!profile) return null
  return (await accountOf(profile)) ? null : { profile, viaCode: true }
}

/** Perfil de quien hace la petición, o null si no tiene acceso */
export async function profileOf(req: Request): Promise<string | null> {
  return (await whoIs(req))?.profile ?? null
}

const OPEN_PATHS = new Set(['/health', '/access', '/access/login', '/access/code', '/access/reset', '/access/logout'])

/** Protege toda la API excepto salud y la propia entrada; el resto de la petición corre como ese perfil */
export const requireAccess: RequestHandler = (req, _res, next) => {
  whoIs(req).then((who) => {
    if (who && !who.viaCode) return runAs(who.profile, next)
    if (OPEN_PATHS.has(req.path) || (who && req.path === '/access/setup')) return who ? runAs(who.profile, next) : next()
    // el panel de administrador tiene su propio código (lo revisa requireAdmin): no necesita cuenta en la app
    if (req.path.startsWith('/admin/')) return next()
    if (who) return next(new AppError(401, 'ACCOUNT_REQUIRED', 'Primero crea tu usuario y contraseña.'))
    next(new AppError(401, 'ACCESS_REQUIRED', 'Entra con tu usuario y contraseña.'))
  }, next)
}

/** Huesitos y premios son solo de la dueña */
export const requireOwner: RequestHandler = (_req, _res, next) => {
  if (isOwner()) return next()
  next(new AppError(403, 'OWNER_ONLY', 'Esta parte es solo para Ash.'))
}

// Freno simple contra adivinar: 10 intentos fallidos cada 10 minutos por IP
const attempts = new Map<string, { n: number; until: number }>()

function guard(key: string) {
  const a = attempts.get(key)
  if (a && a.until > Date.now() && a.n >= 10) throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Espera unos minutos.')
  return {
    fail() {
      const now = Date.now()
      attempts.set(key, { n: (a && a.until > now ? a.n : 0) + 1, until: now + 10 * 60_000 })
    },
    ok: () => attempts.delete(key),
  }
}

async function statusFor(who: Who) {
  const acc = who && !who.viaCode && accessEnabled() ? await accountOf(who.profile) : null
  return {
    required: accessEnabled(),
    granted: !!who && !who.viaCode,
    /** entró con el código: le falta crear su usuario */
    needsAccount: !!who?.viaCode,
    profile: who?.profile ?? null,
    owner: who?.profile === OWNER,
    name: who ? displayNameFor(who.profile) : null,
    username: acc?.username ?? null,
    /** en Vercel los archivos se suben directo a Vercel Blob */
    blobUploads: !!env.BLOB_READ_WRITE_TOKEN,
  }
}

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  maxAge: ONE_YEAR * 1000,
  path: '/',
})

export async function accessStatus(req: Request, res: Response) {
  res.json(await statusFor(await whoIs(req)))
}

// el celular pone mayúscula al inicio o espacios: no importan
const loose = (c: string) => c.replace(/\s+/g, '').toLowerCase()
const findCode = (code: string) => loginCodes().find((p) => sameToken(tokenFor(loose(code)), tokenFor(loose(p.code))))

const Username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._ñ-]{3,24}$/, 'El usuario va de 3 a 24 letras o números, sin espacios.')
const Password = z.string().min(6, 'La contraseña necesita al menos 6 caracteres.').max(200)

/** Entrar con usuario y contraseña */
export async function login(req: Request, res: Response) {
  const g = guard(`login:${req.ip ?? 'unknown'}`)
  const body = z.object({ username: z.string().trim().toLowerCase().min(1).max(60), password: z.string().min(1).max(200) }).parse(req.body)
  const acc = (await db.select().from(accounts).where(eq(accounts.username, body.username)))[0]
  const ok = acc && loginCodes().some((p) => p.name === acc.profile) && (await checkPassword(body.password, acc.passwordHash))
  if (!ok) {
    g.fail()
    throw new AppError(401, 'WRONG_LOGIN', 'Usuario o contraseña incorrectos.')
  }
  g.ok()
  res.cookie(COOKIE, accountToken(acc.profile, acc.passwordHash), cookieOpts())
  res.json(await statusFor({ profile: acc.profile, viaCode: false }))
}

/** Primera vez: entra con su código para poder crear su usuario */
export async function enterCode(req: Request, res: Response) {
  const g = guard(`code:${req.ip ?? 'unknown'}`)
  const { code } = z.object({ code: z.string().trim().min(1).max(200) }).parse(req.body)
  const match = findCode(code)
  if (!match) {
    g.fail()
    throw new AppError(401, 'WRONG_CODE', 'Ese código no es. Revisa mayúsculas y espacios.')
  }
  g.ok()
  if (await accountOf(match.name))
    throw new AppError(409, 'ACCOUNT_EXISTS', 'Ya creaste tu usuario: entra con él. Si olvidaste la contraseña, toca "Olvidé mi contraseña".')
  res.cookie(COOKIE, profileToken(match.name, match.code), cookieOpts())
  res.json(await statusFor({ profile: match.name, viaCode: true }))
}

/** Crear el usuario y la contraseña (solo quien entró con su código y aún no tiene) */
export async function setupAccount(req: Request, res: Response) {
  const who = await whoIs(req)
  if (!who?.viaCode) throw new AppError(400, 'ALREADY_SET', 'Ya tienes usuario y contraseña.')
  const { username, password } = z.object({ username: Username, password: Password }).parse(req.body)
  const taken = (await db.select().from(accounts).where(eq(accounts.username, username)))[0]
  if (taken) throw new AppError(409, 'USERNAME_TAKEN', 'Ese usuario ya existe. Prueba con otro.')
  const passwordHash = await hashPassword(password)
  await db.insert(accounts).values({ profile: who.profile, username, passwordHash })
  res.cookie(COOKIE, accountToken(who.profile, passwordHash), cookieOpts())
  res.json(await statusFor({ profile: who.profile, viaCode: false }))
}

/** Olvidó la contraseña: con su código pone una nueva (y los demás dispositivos tienen que volver a entrar) */
export async function resetPassword(req: Request, res: Response) {
  const g = guard(`code:${req.ip ?? 'unknown'}`)
  const { code, password } = z.object({ code: z.string().trim().min(1).max(200), password: Password }).parse(req.body)
  const match = findCode(code)
  if (!match) {
    g.fail()
    throw new AppError(401, 'WRONG_CODE', 'Ese código no es. Revisa mayúsculas y espacios.')
  }
  g.ok()
  const acc = await accountOf(match.name)
  if (!acc) {
    // todavía no tenía usuario: igual que entrar con el código
    res.cookie(COOKIE, profileToken(match.name, match.code), cookieOpts())
    return res.json(await statusFor({ profile: match.name, viaCode: true }))
  }
  const passwordHash = await hashPassword(password)
  await db.update(accounts).set({ passwordHash, updatedAt: new Date() }).where(eq(accounts.profile, match.name))
  res.cookie(COOKIE, accountToken(match.name, passwordHash), cookieOpts())
  res.json(await statusFor({ profile: match.name, viaCode: false }))
}

/** Cambiar la contraseña desde adentro (pide la actual) */
export async function changePassword(req: Request, res: Response) {
  const who = await whoIs(req)
  if (!who || who.viaCode || !accessEnabled()) throw new AppError(400, 'NO_ACCOUNT', 'Primero crea tu usuario y contraseña.')
  const g = guard(`change:${req.ip ?? 'unknown'}`)
  const { current, password } = z.object({ current: z.string().min(1).max(200), password: Password }).parse(req.body)
  const acc = (await accountOf(who.profile))!
  if (!(await checkPassword(current, acc.passwordHash))) {
    g.fail()
    throw new AppError(401, 'WRONG_PASSWORD', 'La contraseña actual no es esa.')
  }
  g.ok()
  const passwordHash = await hashPassword(password)
  await db.update(accounts).set({ passwordHash, updatedAt: new Date() }).where(eq(accounts.profile, who.profile))
  res.cookie(COOKIE, accountToken(who.profile, passwordHash), cookieOpts())
  res.json(await statusFor(who))
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE, { path: '/' })
  res.json({ ok: true })
}

// ── administrador: ver las cuentas y ponerles contraseña ─────

export async function listAccounts() {
  const rows = await db.select().from(accounts)
  return loginCodes().map((p) => {
    const acc = rows.find((r) => r.profile === p.name)
    return { profile: p.name, name: displayNameFor(p.name), username: acc?.username ?? null, updatedAt: acc?.updatedAt.toISOString() ?? null }
  })
}

/** El administrador le pone usuario y/o contraseña a un perfil (sus otros dispositivos tienen que volver a entrar) */
export async function adminSetAccount(profile: string, body: unknown) {
  if (!loginCodes().some((p) => p.name === profile)) throw new AppError(404, 'NOT_FOUND', 'Esa persona no existe.')
  const { username, password } = z.object({ username: Username.optional(), password: Password }).parse(body)
  const acc = await accountOf(profile)
  const name = username ?? acc?.username
  if (!name) throw new AppError(400, 'USERNAME_REQUIRED', 'Todavía no tiene usuario: escribe uno.')
  const taken = (await db.select().from(accounts).where(eq(accounts.username, name)))[0]
  if (taken && taken.profile !== profile) throw new AppError(409, 'USERNAME_TAKEN', 'Ese usuario ya es de otra persona.')
  const passwordHash = await hashPassword(password)
  if (acc) await db.update(accounts).set({ username: name, passwordHash, updatedAt: new Date() }).where(eq(accounts.profile, profile))
  else await db.insert(accounts).values({ profile, username: name, passwordHash })
  return (await listAccounts()).find((a) => a.profile === profile)!
}

/** Compatibilidad: la app vieja en caché manda el código a POST /api/access */
export const enterAccess = enterCode

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
