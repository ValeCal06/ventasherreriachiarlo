import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'

// El catálogo cambia, así que nunca se guarda una copia vieja.
export const dynamic = 'force-dynamic'

type ProductRow = { id: string; title: string; category: string; images: string[]; description: string; offer: boolean }
type CategoryRow = { name: string }

// Lectura pública: cualquiera puede ver el catálogo, nadie puede modificarlo desde acá.
export async function GET() {
  try {
    const sql = getSql()
    const [products, categories] = await Promise.all([
      sql`select id::text as id, title, category, images, description, offer from catalog_products order by id`,
      sql`select name from catalog_categories order by id`,
    ])

    return NextResponse.json(
      {
        products: (products as ProductRow[]).map((p) => ({
          id: Number(p.id),
          title: p.title,
          category: p.category,
          images: Array.isArray(p.images) ? p.images : [],
          description: p.description,
          offer: p.offer === true,
        })),
        categories: (categories as CategoryRow[]).map((c) => c.name),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('Error al leer el catálogo:', error)
    return NextResponse.json({ error: 'No se pudo leer el catálogo' }, { status: 500 })
  }
}
