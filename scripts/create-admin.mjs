// Genera la contraseña del panel de administración y los dos valores secretos que necesita el sitio.
//
// Uso (desde la carpeta raíz del proyecto):
//   node scripts/create-admin.mjs
//
// Imprime una contraseña nueva (la que vas a escribir para entrar al panel) y las dos líneas
// que hay que agregar a .env.local y a las variables de entorno de Vercel.
// Si lo corrés de nuevo se genera una contraseña distinta (y la anterior deja de servir
// cuando actualizás ADMIN_PASSWORD_HASH).

import { randomBytes, scryptSync } from 'node:crypto'

// Sin letras y números que se confunden (0/O, 1/l/I)
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomPassword(length = 16) {
  const limit = 256 - (256 % ALPHABET.length)
  let out = ''
  while (out.length < length) {
    for (const byte of randomBytes(32)) {
      if (byte < limit && out.length < length) out += ALPHABET[byte % ALPHABET.length]
    }
  }
  return out
}

const password = randomPassword(16)
const salt = randomBytes(16)
const hash = scryptSync(password, salt, 64)

console.log('\n==============================================================')
console.log(' CONTRASEÑA DEL PANEL (guardala en un lugar seguro):')
console.log('\n   ' + password)
console.log('\n Esta contraseña NO se guarda en ningún lado y no se puede recuperar.')
console.log('==============================================================\n')
console.log('Agregá estas dos líneas a tu archivo .env.local:\n')
console.log(`ADMIN_PASSWORD_HASH="scrypt.${salt.toString('hex')}.${hash.toString('hex')}"`)
console.log(`ADMIN_SESSION_SECRET="${randomBytes(32).toString('hex')}"`)
console.log('\nY las mismas dos variables en Vercel (Settings -> Environment Variables), pegando solo el valor, sin las comillas.\n')
