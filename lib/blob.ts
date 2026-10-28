import { del } from '@vercel/blob'
import { getSql } from '@/lib/db'

const isBlobUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(value)

// Borra de Vercel Blob las fotos que ya no usa ningún producto.
// Nunca hace fallar el guardado: si algo sale mal, solo queda un archivo sin usar en el almacenamiento.
export async function deleteUnusedPhotos(urls: unknown[]) {
  const candidates = [...new Set(urls.filter(isBlobUrl))]
  if (!candidates.length) return
  try {
    const sql = getSql()
    const free: string[] = []
    for (const url of candidates) {
      const used = await sql`select 1 as ok from catalog_products where images @> ${JSON.stringify([url])}::jsonb limit 1`
      if (!used.length) free.push(url)
    }
    if (free.length) await del(free)
  } catch (error) {
    console.error('No se pudieron borrar fotos sin uso:', error)
  }
}
