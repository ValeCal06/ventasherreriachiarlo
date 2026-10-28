// Pasa las fotos que están guardadas dentro de la base de datos (como texto base64) a Vercel Blob,
// y deja en la base solo la dirección (URL) de cada foto.
//
// Uso (desde la carpeta raíz del proyecto):
//   node --env-file=.env.local scripts/migrate-images.mjs          -> solo muestra qué haría (no cambia nada)
//   node --env-file=.env.local scripts/migrate-images.mjs --apply  -> migra de verdad
//
// Reglas:
//  - Solo se tocan las fotos incrustadas (las que empiezan con "data:image"). Las que ya son rutas
//    (/products/...) o direcciones web no se tocan.
//  - Antes de cambiar algo se guarda un respaldo de la base en scripts/backup-antes-de-migrar-fotos.json.
//  - Cada foto se sube, se verifica que se pueda abrir y recién entonces se actualiza la base.
//  - Se puede correr más de una vez sin problema: lo que ya se migró no se vuelve a subir.

import { writeFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { put } from '@vercel/blob'

const apply = process.argv.includes('--apply')
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING
const hasToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN)

if (!dbUrl) {
  console.error('No encontré DATABASE_URL. Revisá que .env.local esté en la carpeta raíz del proyecto.')
  process.exit(1)
}
if (!hasToken) {
  console.error('No encontré BLOB_READ_WRITE_TOKEN en .env.local. Agregalo y volvé a intentar.')
  process.exit(1)
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

function parseDataUrl(value) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([\s\S]+)$/.exec(value)
  if (!match) return null
  return { type: match[1], ext: EXT[match[1]], buffer: Buffer.from(match[2], 'base64') }
}

const kb = (n) => (n / 1024).toFixed(0) + ' KB'
const sql = neon(dbUrl)

const rows = await sql`select id::text as id, title, images from catalog_products order by id`

const pending = rows
  .map((r) => ({ id: r.id, title: r.title, images: Array.isArray(r.images) ? r.images : [] }))
  .map((r) => ({ ...r, inline: r.images.filter((img) => typeof img === 'string' && img.startsWith('data:')).length }))

console.log('\nFOTOS POR PRODUCTO')
for (const p of pending) {
  const bytes = p.images.filter((i) => typeof i === 'string' && i.startsWith('data:')).reduce((sum, i) => sum + i.length, 0)
  console.log(` - [${p.id}] ${p.title} | ${p.images.length} foto(s), ${p.inline} incrustada(s) (${kb(bytes)}) -> ${p.inline ? 'SE MIGRA' : 'no hace falta'}`)
}

const toMigrate = pending.filter((p) => p.inline > 0)
if (!toMigrate.length) {
  console.log('\nNo hay nada para migrar. Todas las fotos ya son direcciones.')
  process.exit(0)
}

if (!apply) {
  console.log(`\nSe subirían ${toMigrate.reduce((s, p) => s + p.inline, 0)} foto(s) de ${toMigrate.length} producto(s). No se cambió nada.`)
  console.log('Si todo está bien, repetí el comando agregando --apply al final.')
  process.exit(0)
}

// ---------- Respaldo antes de tocar nada ----------
const backupProducts = await sql`select id::text as id, title, category, images, description, offer from catalog_products order by id`
const backupCategories = await sql`select name from catalog_categories order by id`
writeFileSync('scripts/backup-antes-de-migrar-fotos.json', JSON.stringify({ products: backupProducts, categories: backupCategories.map((c) => c.name) }))
console.log('\nRespaldo guardado en scripts/backup-antes-de-migrar-fotos.json')

// ---------- Migración ----------
for (const p of toMigrate) {
  const newImages = []
  let n = 0
  for (const image of p.images) {
    if (typeof image === 'string' && image.startsWith('data:')) {
      n += 1
      const parsed = parseDataUrl(image)
      if (!parsed || !parsed.buffer.length) {
        console.error(`[${p.id}] ${p.title}: la foto ${n} no tiene un formato válido. Me detengo sin cambiar este producto.`)
        process.exit(1)
      }
      const uploaded = await put(`productos/${p.id}-${n}.${parsed.ext}`, parsed.buffer, {
        access: 'public',
        addRandomSuffix: true,
        contentType: parsed.type,
      })
      const check = await fetch(uploaded.url, { method: 'HEAD' })
      if (!check.ok) {
        console.error(`[${p.id}] ${p.title}: subí la foto ${n} pero no se puede abrir (${check.status}). Me detengo sin cambiar este producto.`)
        process.exit(1)
      }
      console.log(` - [${p.id}] foto ${n} subida (${kb(parsed.buffer.length)})`)
      newImages.push(uploaded.url)
    } else {
      newImages.push(image)
    }
  }
  await sql`update catalog_products set images = ${JSON.stringify(newImages)}::jsonb, updated_at = now() where id = ${p.id}::bigint`
  console.log(`   Producto "${p.title}" actualizado.`)
}

console.log('\nListo. Las fotos ahora viven en Vercel Blob y la base guarda solo sus direcciones.')
