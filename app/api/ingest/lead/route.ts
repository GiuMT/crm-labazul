import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeEmail, origemLegivel, comprouByEmail, ltvByEmail } from '@/lib/queries'

/**
 * Ingestao de LEAD na fila de recuperacao. Protegido por x-ingest-token.
 *
 * Quem chama: o workflow n8n "LabAzul - Promover Lead para o CRM", que roda de
 * 30 em 30 min e so envia quem preencheu ha mais de 2h SEM venda aprovada.
 * Ou seja: a decisao de "esta na hora de contatar" e do n8n; aqui a gente
 * apenas materializa o contato e o card.
 *
 * Diferente do CRM do Abel, este endpoint NAO grava o lead cru numa tabela
 * propria — a `public.leads_captura` ja e gravada pelo webhook do modal, direto.
 * Duplicar seria criar duas verdades sobre o mesmo lead.
 */
export async function POST(req: Request) {
  if (req.headers.get('x-ingest-token') !== process.env.INGEST_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const b = await req.json().catch(() => ({}) as Record<string, unknown>)
  const rawEmail = (b.email as string) || ''
  if (!rawEmail.trim()) {
    return NextResponse.json({ error: 'email obrigatorio' }, { status: 400 })
  }

  const email = normalizeEmail(rawEmail)
  const name = ((b.nome as string) || (b.name as string) || '').trim() || null
  const phone = ((b.whatsapp as string) || (b.phone as string) || '').replace(/\D/g, '') || null
  const src = (b.src as string) || null
  const sck = (b.sck as string) || null
  const campaign = (b.utm_campaign as string) || (b.campaign as string) || null
  const evento = (b.evento as string) || 'LDF15'
  const source = origemLegivel(src)
  const criadoEm = b.criado_em ? new Date(b.criado_em as string) : new Date()

  // Confere a venda no momento da ingestao. O n8n ja filtra, mas o sync da Hotmart
  // pode ter rodado entre a consulta dele e esta chamada — e abordar quem acabou
  // de comprar e o pior erro que este CRM pode cometer.
  const comprou = await comprouByEmail(email)
  const ltv = comprou ? await ltvByEmail(email) : 0

  const existing = await prisma.contact.findUnique({ where: { email } })
  const contact = existing
    ? await prisma.contact.update({
        where: { email },
        data: {
          name: existing.name || name,
          phone: existing.phone || phone,
          // atribuicao original nunca e sobrescrita — mesma regra do Hotmart Sync
          src: existing.src || src,
          sck: existing.sck || sck,
          source: existing.source || source,
          campaign: existing.campaign || campaign,
          evento: existing.evento || evento,
          isCliente: comprou || existing.isCliente,
          ltv: comprou ? ltv : existing.ltv,
        },
      })
    : await prisma.contact.create({
        data: {
          email,
          name,
          phone,
          src,
          sck,
          source,
          campaign,
          evento,
          isCliente: comprou,
          ltv,
          firstSeenAt: criadoEm,
        },
      })

  // Card na coluna certa. Stage-driven: posicao 1 = fila de contato; isWon = comprou.
  const jaTemDeal = await prisma.deal.findFirst({ where: { contactId: contact.id } })
  if (!jaTemDeal) {
    const stage = comprou
      ? await prisma.stage.findFirst({ where: { isWon: true } })
      : await prisma.stage.findFirst({ where: { position: 1 } })
    if (stage) {
      await prisma.deal.create({
        data: {
          contactId: contact.id,
          stageId: stage.id,
          status: comprou ? 'won' : 'open',
          value: ltv,
        },
      })
    }
  }

  if (!existing) {
    await prisma.activity.create({
      data: {
        contactId: contact.id,
        type: 'sistema',
        text: `Preencheu o formulário da página de vendas (${evento})`,
        createdAt: criadoEm,
      },
    })
  }

  return NextResponse.json({ ok: true, contactId: contact.id, comprou })
}
