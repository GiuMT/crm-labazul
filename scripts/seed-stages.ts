/**
 * Seed dos estagios dos dois funis + trava de idempotencia de venda.
 * Nao popula contatos — isso e o `npm run db:seed` (scripts/seed.ts).
 * Idempotente: pode rodar quantas vezes quiser (upsert por position).
 *
 *   npm run db:stages
 */
import { prisma } from '../lib/prisma'

// A `position` e unica no banco inteiro, entao os funis nao repetem numero:
// o de abandono ocupa 1 a 5 e o da lista de espera 6 a 11. A ordem dentro da
// tela e por position, ja filtrada por funil.
//
// funil 'abandono'    — T15: uma unica automacao (entrada apos 2h sem venda).
// funil 'lista-espera'— Metodo Azul perpetuo: o card nasce na inscricao.
const STAGES = [
  { position: 1, funil: 'abandono', name: 'Pronto para contato', color: '#2052E9', isWon: false, isLost: false },
  { position: 2, funil: 'abandono', name: 'Em contato', color: '#30E2FF', isWon: false, isLost: false },
  { position: 3, funil: 'abandono', name: 'Respondeu', color: '#12307D', isWon: false, isLost: false },
  { position: 4, funil: 'abandono', name: 'Comprou', color: '#16A34A', isWon: true, isLost: false },
  { position: 5, funil: 'abandono', name: 'Perdido', color: '#DC2626', isWon: false, isLost: true },
  { position: 6, funil: 'lista-espera', name: 'Na lista', color: '#2052E9', isWon: false, isLost: false },
  { position: 7, funil: 'lista-espera', name: 'Abordado', color: '#30E2FF', isWon: false, isLost: false },
  { position: 8, funil: 'lista-espera', name: 'Respondeu', color: '#12307D', isWon: false, isLost: false },
  { position: 9, funil: 'lista-espera', name: 'Recebeu oferta', color: '#7C3AED', isWon: false, isLost: false },
  { position: 10, funil: 'lista-espera', name: 'Comprou', color: '#16A34A', isWon: true, isLost: false },
  { position: 11, funil: 'lista-espera', name: 'Perdido', color: '#DC2626', isWon: false, isLost: true },
]

async function main() {
  for (const s of STAGES) {
    await prisma.stage.upsert({
      where: { position: s.position },
      update: { name: s.name, funil: s.funil, color: s.color, isWon: s.isWon, isLost: s.isLost },
      create: s,
    })
  }
  console.log(`OK — ${STAGES.length} estagios garantidos.`)

  // Trava atomica de idempotencia: uma compra (type='compra') so pode existir 1x por contato+texto.
  // Impede LTV dobrado quando a mesma venda e reprocessada (Pix/boleto parcelado).
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS activities_compra_uniq
       ON crm.activities ("contactId", text)
       WHERE type = 'compra';`
  )
  console.log('OK — indice unico parcial de idempotencia de compra garantido.')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
