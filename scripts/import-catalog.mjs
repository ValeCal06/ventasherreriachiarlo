// Importa un respaldo (chiarlo-catalogo.json) a la base de datos Neon.
//
// Uso (desde la carpeta raíz del proyecto):
//   node --env-file=.env.local scripts/import-catalog.mjs scripts/chiarlo-catalogo.json          -> solo muestra qué haría (no cambia nada)
//   node --env-file=.env.local scripts/import-catalog.mjs scripts/chiarlo-catalogo.json --apply  -> importa de verdad
//
// Reglas:
//  - Las categorías nuevas se agregan; las que ya existen no se tocan.
//  - Los productos con un id que ya existe se ACTUALIZAN con la versión del respaldo.
//  - Los productos con un id nuevo se agregan. No se borra nada.

import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const file = args.find((a) => !a.startsWith('--'))

if (!file) {
  console.error('Falta el archivo. Ejemplo: node --env-file=.env.local scripts/import-catalog.mjs scripts/chiarlo-catalogo.json')
  process.exit(1)
}

// ---------- 1. Leer y validar el archivo ----------
let raw
try {
  raw = JSON.parse(readFileSync(file, 'utf8'))
} catch (e) {
  console.error('No pude leer el archivo como JSON:', e.message)
  process.exit(1)
}

const products = Array.isArray(raw.products) ? raw.products : []
const categories = Array.isArray(raw.categories) ? raw.categories : []
const problems = []

const cleanProducts = products.map((p, i) => {
  const title = typeof p.title === 'string' ? p.title.trim() : ''
  const category = typeof p.category === 'string' ? p.category.trim() : ''
  const description = typeof p.description === 'string' ? p.description : ''
  const images = Array.isArray(p.images) ? p.images.filter((x) => typeof x === 'string' && x.length > 0) : []
  const idOk = Number.isSafeInteger(Number(p.id)) && Number(p.id) > 0
  if (!title) problems.push(`Producto #${i + 1}: no tiene título`)
  if (!category) problems.push(`Producto #${i + 1} (${title || 'sin título'}): no tiene categoría`)
  if (!idOk) problems.push(`Producto #${i + 1} (${title || 'sin título'}): id inválido`)
  return { id: String(p.id), title, category, description, images, offer: p.offer === true }
})

const categoryNames = [...new Set([...categories, ...cleanProducts.map((p) => p.category)].map((c) => String(c).trim()).filter(Boolean))]

if (problems.length) {
  console.error('El archivo tiene problemas y no se importó nada:\n - ' + problems.join('\n - '))
  process.exit(1)
}

const kb = (n) => (n / 1024).toFixed(0) + ' KB'
const sizeOf = (p) => kb(Buffer.byteLength(JSON.stringify(p.images)))

console.log(`\nArchivo: ${file}`)
console.log(`Productos: ${cleanProducts.length} | Categorías: ${categoryNames.length}\n`)

// ---------- 2. Conectar con la base de datos ----------
const url = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING
if (!url) {
  console.log('(No encontré DATABASE_URL, así que solo te muestro el contenido del archivo.)')
  for (const p of cleanProducts) console.log(` - [${p.id}] ${p.title} | ${p.category} | ${p.images.length} imagen(es), ${sizeOf(p)}`)
  console.log('\nCategorías:', categoryNames.join(', '))
  process.exit(0)
}

const sql = neon(url)

const existingProducts = await sql`select id::text as id, title from catalog_products`
const existingCategories = await sql`select name from catalog_categories`
const existingIds = new Map(existingProducts.map((r) => [r.id, r.title]))
const existingCats = new Set(existingCategories.map((r) => r.name))

console.log('PRODUCTOS')
for (const p of cleanProducts) {
  const action = existingIds.has(p.id) ? `ACTUALIZA (hoy se llama "${existingIds.get(p.id)}")` : 'NUEVO'
  console.log(` - [${p.id}] ${p.title} | ${p.category} | ${p.images.length} imagen(es), ${sizeOf(p)} -> ${action}`)
}
console.log('\nCATEGORÍAS')
for (const c of categoryNames) console.log(` - ${c} -> ${existingCats.has(c) ? 'ya existe' : 'NUEVA'}`)

if (!apply) {
  console.log('\nNo se cambió nada. Si todo está bien, repetí el comando agregando --apply al final.')
  process.exit(0)
}

// ---------- 3. Importar (todo junto: o entra todo o no entra nada) ----------
const queries = [
  ...categoryNames.map((name) => sql`insert into catalog_categories (name) values (${name}) on conflict (name) do nothing`),
  ...cleanProducts.map(
    (p) => sql`
      insert into catalog_products (id, title, category, images, description, offer)
      values (${p.id}::bigint, ${p.title}, ${p.category}, ${JSON.stringify(p.images)}::jsonb, ${p.description}, ${p.offer})
      on conflict (id) do update set
        title = excluded.title,
        category = excluded.category,
        images = excluded.images,
        description = excluded.description,
        offer = excluded.offer,
        updated_at = now()`,
  ),
]
await sql.transaction(queries)

const total = await sql`select (select count(*) from catalog_products)::int as productos, (select count(*) from catalog_categories)::int as categorias`
console.log(`\nListo. Ahora la base tiene ${total[0].productos} productos y ${total[0].categorias} categorías.`)
