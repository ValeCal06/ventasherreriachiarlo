import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { parseProductInput } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

// Crear un producto. Solo administrador.
export async function POST(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const parsed = parseProductInput(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const p = parsed.value

  try {
    const sql = getSql()
    const exists = await sql`select 1 as ok from catalog_categories where name = ${p.category}`
    if (!exists.length) return NextResponse.json({ error: 'La categoría no existe' }, { status: 400 })

    const id = Date.now()
    const rows = await sql`
      insert into catalog_products (id, title, category, images, description, offer)
      values (${id}::bigint, ${p.title}, ${p.category}, ${JSON.stringify(p.images)}::jsonb, ${p.description}, ${p.offer})
      returning id::text as id`
    return NextResponse.json({ ok: true, id: Number((rows as { id: string }[])[0].id) })
  } catch (error) {
    console.error('Error al crear el producto:', error)
    return NextResponse.json({ error: 'No se pudo guardar el producto' }, { status: 500 })
  }
}
