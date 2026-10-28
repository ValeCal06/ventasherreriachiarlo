import { NextResponse } from 'next/server'
import { SESSION_COOKIE, authConfigured, createSessionToken, isSameOrigin, sessionCookieOptions, verifyPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 })
  if (!authConfigured()) return NextResponse.json({ error: 'El acceso al panel todavía no está configurado.' }, { status: 503 })

  const body = await req.json().catch(() => null)
  const password = body && typeof body.password === 'string' ? body.password : ''

  if (!password || password.length > 200 || !verifyPassword(password)) {
    await wait(800) // frena los intentos repetidos
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  }

  const token = createSessionToken()
  if (!token) return NextResponse.json({ error: 'El acceso al panel todavía no está configurado.' }, { status: 503 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
  return res
}
