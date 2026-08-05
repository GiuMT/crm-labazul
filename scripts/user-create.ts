/**
 * Cria (ou atualiza a senha de) um usuario do CRM.
 *   npm run user:create -- "Nome Sobrenome" email@dominio.com senhaForte
 */
import { prisma } from '../lib/prisma'
import bcrypt from 'bcryptjs'

async function main() {
  const [name, emailRaw, password] = process.argv.slice(2)
  if (!name || !emailRaw || !password) {
    console.error('Uso: npm run user:create -- "Nome" email senha')
    process.exit(1)
  }
  const email = emailRaw.trim().toLowerCase()
  const passwordHash = await bcrypt.hash(password, 10)

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash },
    create: { name, email, passwordHash, role: 'admin' },
  })
  console.log(`OK — usuario ${user.email} pronto (id ${user.id}).`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
