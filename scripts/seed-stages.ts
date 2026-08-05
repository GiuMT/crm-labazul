/**
 * Seed dos 5 estagios do pipeline + trava de idempotencia de venda.
 * Nao popula contatos — isso e o `npm run db:seed` (scripts/seed.ts).
 * Idempotente: pode rodar quantas vezes quiser (upsert por position).
 *
 *   npm run db:stages
 */
import { prisma } from '../lib/prisma'

// SPEC §5 — uma unica automacao (entrada em "Nao comprou" apos 2h sem venda);
// o resto e a equipe arrastando o card.
const STAGES = [
  { position: 1, name: 'Pronto para contato', color: '#2052E9', isWon: false, isLost: false },
  { position: 2, name: 'Em contato', color: '#30E2FF', isWon: false, isLost: false },
  { position: 3, name: 'Respondeu', color: '#12307D', isWon: false, isLost: false },
  { position: 4, name: 'Comprou', color: '#16A34A', isWon: true, isLost: false },
  { position: 5, name: 'Perdido', color: '#DC2626', isWon: false, isLost: true },
]

async function main() {
  for (const s of STAGES) {
    await prisma.stage.upsert({
      where: { position: s.position },
      update: { name: s.name, color: s.color, isWon: s.isWon, isLost: s.isLost },
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
