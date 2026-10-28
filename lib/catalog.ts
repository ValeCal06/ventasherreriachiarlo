// Validación de los datos que llegan desde el panel. Nada se guarda sin pasar por acá.

export type ProductInput = { title: string; category: string; description: string; images: string[]; offer: boolean }

const IMAGE_PATH = /^\/products\/[A-Za-z0-9._-]+$/

function validImage(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 600) return false
  if (IMAGE_PATH.test(value)) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com')
  } catch {
    return false
  }
}

export function parseProductInput(body: unknown): { ok: true; value: ProductInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Datos inválidos' }
  const b = body as Record<string, unknown>
  const title = typeof b.title === 'string' ? b.title.trim() : ''
  const category = typeof b.category === 'string' ? b.category.trim() : ''
  const description = typeof b.description === 'string' ? b.description.trim() : ''
  if (!title || title.length > 150) return { ok: false, error: 'El nombre del producto es obligatorio (máximo 150 caracteres)' }
  if (!category || category.length > 80) return { ok: false, error: 'Elegí una categoría' }
  if (description.length > 6000) return { ok: false, error: 'La descripción es demasiado larga (máximo 6000 caracteres)' }
  if (!Array.isArray(b.images) || b.images.length < 1 || b.images.length > 12) return { ok: false, error: 'Cargá entre 1 y 12 fotos' }
  if (!b.images.every(validImage)) return { ok: false, error: 'Alguna foto no es válida. Volvé a subirla.' }
  return { ok: true, value: { title, category, description, images: b.images as string[], offer: b.offer === true } }
}

export function parseId(raw: string): number | null {
  if (!/^\d{1,16}$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
