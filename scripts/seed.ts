/**
 * Seed dos CONTATOS a partir das bases que ja existem no banco `labazul`.
 *
 *   public.leads_captura  → quem preencheu o modal da pagina de vendas T15
 *   public.vendas         → transacoes Hotmart (sync de hora em hora)
 *
 * Regra (SPEC §5): entra na fila "Nao comprou" quem preencheu ha mais de 2h
 * e nao tem venda aprovada. Quem ja comprou entra direto em "Comprou".
 *
 * Idempotente: dedup por email (lower/trim). Pode rodar quantas vezes quiser.
 *
 *   npm run db:seed
 */
import { prisma } from '../lib/prisma'
import {
  getTodosLeads,
  getVendasByEmail,
  normalizeEmail,
  origemLegivel,
  VALID_SALE_STATUS,
  JANELA_HORAS,
} from '../lib/queries'

async function main() {
  const stages = await prisma.stage.findMany({ orderBy: { position: 'asc' } })
  if (stages.length === 0) {
    throw new Error('Nenhum estagio no banco. Rode `npm run db:stages` antes.')
  }
  const filaContato = stages.find((s) => s.position === 1)!
  const comprou = stages.find((s) => s.isWon)!

  const leads = await getTodosLeads()
  console.log(`Lidos ${leads.length} leads de public.leads_captura.`)

  const agora = Date.now()
  let novos = 0
  let atualizados = 0
  let naFila = 0
  let compradores = 0
  let aguardando = 0

  for (const lead of leads) {
    const email = normalizeEmail(lead.email)
    if (!email || !email.includes('@')) continue

    // So conta venda A PARTIR da captura (com 1 dia de tolerancia). Cliente antigo
    // da base tem venda aprovada de meses atras e mesmo assim nao comprou este
    // ingresso — ele pertence a fila, nao a coluna de ganho.
    const corte = new Date(lead.criado_em).getTime() - 24 * 60 * 60 * 1000
    const vendas = await getVendasByEmail(email)
    const aprovadas = vendas.filter(
      (v) => VALID_SALE_STATUS.includes(v.status) && new Date(v.order_date).getTime() >= corte
    )
    const ltv = aprovadas.reduce((s, v) => s + Number(v.price_value || 0), 0)

    // Ainda dentro da janela e sem compra: nao entra no CRM agora.
    const horasDesde = (agora - new Date(lead.criado_em).getTime()) / 36e5
    if (aprovadas.length === 0 && horasDesde < JANELA_HORAS) {
      aguardando++
      continue
    }

    const dados = {
      name: lead.nome?.trim() || null,
      phone: lead.whatsapp || null,
      source: origemLegivel(lead.src),
      src: lead.src,
      sck: lead.sck,
      campaign: lead.utm_campaign,
      evento: lead.evento,
      isCliente: aprovadas.length > 0,
      ltv,
      firstSeenAt: new Date(lead.criado_em),
    }

    const existente = await prisma.contact.findUnique({ where: { email } })

    const contato = existente
      ? await prisma.contact.update({ where: { email }, data: dados })
      : await prisma.contact.create({ data: { email, ...dados } })

    existente ? atualizados++ : novos++

    const stageId = aprovadas.length > 0 ? comprou.id : filaContato.id
    aprovadas.length > 0 ? compradores++ : naFila++

    // 1 deal por contato. Se ja existe, so garante o estagio de quem comprou —
    // nunca puxa de volta um card que a equipe ja moveu na mao.
    const dealExistente = await prisma.deal.findFirst({ where: { contactId: contato.id } })
    if (!dealExistente) {
      await prisma.deal.create({
        data: {
          contactId: contato.id,
          stageId,
          value: ltv,
          status: aprovadas.length > 0 ? 'won' : 'open',
        },
      })
    } else if (aprovadas.length > 0 && dealExistente.stageId !== comprou.id) {
      await prisma.deal.update({
        where: { id: dealExistente.id },
        data: { stageId: comprou.id, status: 'won', value: ltv, movedAt: new Date() },
      })
    }

    // Timeline. A trava de idempotencia (indice unico parcial) impede
    // que a mesma compra seja registrada duas vezes e dobre o LTV.
    if (!existente) {
      await prisma.activity.create({
        data: {
          contactId: contato.id,
          type: 'sistema',
          text: `Preencheu o formulário da página de vendas (${lead.evento})`,
          createdAt: new Date(lead.criado_em),
        },
      })
    }

    for (const v of aprovadas) {
      const texto = `Compra ${v.transaction} — ${v.product_name || 'produto'} — R$ ${Number(
        v.price_value || 0
      ).toFixed(2)}`
      try {
        await prisma.activity.create({
          data: {
            contactId: contato.id,
            type: 'compra',
            text: texto,
            createdAt: new Date(v.approved_date || v.order_date),
          },
        })
      } catch {
        // Violacao do indice unico = compra ja registrada. E o comportamento esperado.
      }
    }
  }

  console.log('')
  console.log('Resultado do seed')
  console.log(`  contatos criados ......... ${novos}`)
  console.log(`  contatos atualizados ..... ${atualizados}`)
  console.log(`  na fila "Não comprou" .... ${naFila}`)
  console.log(`  em "Comprou" ............. ${compradores}`)
  console.log(`  aguardando a janela de ${JANELA_HORAS}h .. ${aguardando}`)
  console.log('')
  console.log('Confira: contatos ≈ e-mails únicos em leads_captura menos os que aguardam.')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
