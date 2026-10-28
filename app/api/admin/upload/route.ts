import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 4 * 1024 * 1024 // Vercel acepta hasta 4,5 MB por envío

function detect(buf: Buffer): { ext: string; type: string } | null {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' }
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' }
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp', type: 'image/webp' }
  return null
}

// Sube una foto a Vercel Blob y devuelve su dirección. Solo para el administrador.
export async function POST(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'No se pudo leer la foto' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta la foto' }, { status: 400 })
  if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: 'La foto es demasiado grande (máximo 4 MB)' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const kind = detect(buffer)
  if (!kind) return NextResponse.json({ error: 'Formato de foto no válido (usá JPG, PNG o WEBP)' }, { status: 400 })

  try {
    const blob = await put(`productos/${Date.now()}.${kind.ext}`, buffer, { access: 'public', addRandomSuffix: true, contentType: kind.type })
    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error('Error al subir la foto:', error)
    return NextResponse.json({ error: 'No se pudo guardar la foto' }, { status: 500 })
  }
}
