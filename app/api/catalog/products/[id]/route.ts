import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { parseId, parseProductInput } from '@/lib/catalog'
import { deleteUnusedPhotos } from '@/lib/blob'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

// Editar un producto. Solo administrador.
export async function PUT(req: Request, { params }: Context) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const id = parseId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Producto inválido' }, { status: 400 })
  const parsed = parseProductInput(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const p = parsed.value

  try {
    const sql = getSql()
    const exists = await sql`select 1 as ok from catalog_categories where name = ${p.category}`
    if (!exists.length) return NextResponse.json({ error: 'La categoría no existe' }, { status: 400 })

    const before = await sql`select images from catalog_products where id = ${id}::bigint`
    if (!before.length) return NextResponse.json({ error: 'El producto ya no existe' }, { status: 404 })
    const oldImages: unknown[] = Array.isArray(before[0].images) ? before[0].images : []

    const rows = await sql`
      update catalog_products
      set title = ${p.title}, category = ${p.category}, images = ${JSON.stringify(p.images)}::jsonb,
          description = ${p.description}, offer = ${p.offer}, updated_at = now()
      where id = ${id}::bigint
      returning id::text as id`
    if (!rows.length) return NextResponse.json({ error: 'El producto ya no existe' }, { status: 404 })

    // Las fotos que se quitaron del producto se borran del almacenamiento.
    await deleteUnusedPhotos(oldImages.filter((image) => !p.images.includes(image as string)))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al editar el producto:', error)
    return NextResponse.json({ error: 'No se pudo guardar el producto' }, { status: 500 })
  }
}

// Eliminar un producto (y sus fotos). Solo administrador.
export async function DELETE(req: Request, { params }: Context) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const id = parseId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Producto inválido' }, { status: 400 })

  try {
    const sql = getSql()
    const rows = await sql`delete from catalog_products where id = ${id}::bigint returning id::text as id, images`
    if (!rows.length) return NextResponse.json({ error: 'El producto ya no existe' }, { status: 404 })

    await deleteUnusedPhotos(Array.isArray(rows[0].images) ? rows[0].images : [])
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al eliminar el producto:', error)
    return NextResponse.json({ error: 'No se pudo eliminar el producto' }, { status: 500 })
  }
}
