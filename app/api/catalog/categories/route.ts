import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function readName(body: unknown): string {
  return body && typeof body === 'object' && typeof (body as { name?: unknown }).name === 'string' ? (body as { name: string }).name.trim() : ''
}

// Crear una categoría. Solo administrador.
export async function POST(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const name = readName(await req.json().catch(() => null))
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

// Eliminar una categoría. Solo administrador, y solo si no tiene productos.
export async function DELETE(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const name = readName(await req.json().catch(() => null))
  if (!name || name.length > 60) return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })

  try {
    const sql = getSql()
    const used = await sql`select count(*)::int as n from catalog_products where category = ${name}`
    const count = Number((used as { n: number }[])[0].n)
    if (count > 0) {
      return NextResponse.json({ error: `No se puede eliminar "${name}": tiene ${count} producto(s). Cambiales la categoría o eliminalos primero.` }, { status: 409 })
    }
    const rows = await sql`delete from catalog_categories where name = ${name} returning id::text as id`
    if (!rows.length) return NextResponse.json({ error: 'La categoría ya no existe' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al eliminar la categoría:', error)
    return NextResponse.json({ error: 'No se pudo eliminar la categoría' }, { status: 500 })
  }
}
