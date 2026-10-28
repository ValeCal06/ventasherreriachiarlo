import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Crear una categoría. Solo administrador.
export async function POST(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const body = await req.json().catch(() => null)
  const name = body && typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 60) return NextResponse.json({ error: 'El nombre de la categoría es obligatorio (máximo 60 caracteres)' }, { status: 400 })

  try {
    const sql = getSql()
    await sql`insert into catalog_categories (name) values (${name}) on conflict (name) do nothing`
    return NextResponse.json({ ok: true, name })
  } catch (error) {
    console.error('Error al crear la categoría:', error)
    return NextResponse.json({ error: 'No se pudo guardar la categoría' }, { status: 500 })
  }
}
