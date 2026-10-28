import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Acceso al panel de administración.
// - La contraseña nunca está en el código: solo se guarda su "huella" (ADMIN_PASSWORD_HASH).
// - Al ingresar, el servidor entrega una cookie firmada (ADMIN_SESSION_SECRET) que dura 12 horas.
// - No existe ningún registro de usuarios: hay una sola contraseña de administrador.

export const SESSION_COOKIE = 'chiarlo_admin'
export const SESSION_SECONDS = 60 * 60 * 12

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: SESSION_SECONDS,
}

function getSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET
  return secret && secret.length >= 32 ? secret : null
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function authConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD_HASH) && getSecret() !== null
}

export function verifyPassword(password: string): boolean {
  const stored = process.env.ADMIN_PASSWORD_HASH
  if (!stored) return false
  const [scheme, saltHex, hashHex] = stored.split('.')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  if (!expected.length) return false
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

export function createSessionToken(): string | null {
  const secret = getSecret()
  if (!secret) return null
  const payload = `v1.${Math.floor(Date.now() / 1000) + SESSION_SECONDS}`
  return `${payload}.${sign(payload, secret)}`
}

export function isValidSessionToken(token: string | undefined | null): boolean {
  const secret = getSecret()
  if (!secret || !token) return false
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return false
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, secret))
  const given = Buffer.from(parts[2])
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false
  const expires = Number(parts[1])
  return Number.isFinite(expires) && expires > Date.now() / 1000
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies()
  return isValidSessionToken(store.get(SESSION_COOKIE)?.value)
}

// Las acciones que modifican datos solo se aceptan si vienen desde la propia página.
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

// Se usa al principio de cada ruta que modifica algo. Devuelve una respuesta de rechazo, o null si todo está bien.
export async function requireAdmin(req: Request): Promise<NextResponse | null> {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 })
  if (!(await isAdmin())) return NextResponse.json({ error: 'Tu sesión venció. Volvé a ingresar.' }, { status: 401 })
  return null
}
