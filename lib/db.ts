import { neon } from '@neondatabase/serverless'

// Conexión a la base de datos Neon. Se crea recién cuando se usa por primera vez.
let client: ReturnType<typeof neon> | null = null

export function getSql() {
  if (!client) {
    const url = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING
    if (!url) throw new Error('Falta la variable DATABASE_URL')
    client = neon(url)
  }
  return client
}
