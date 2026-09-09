import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeEmail, origemLegivel, comprouByEmail, temMetodoAzulAtivo } from '@/lib/queries'

/**
 * Ingestao de LEAD na fila de recuperacao. Protegido por x-ingest-token.
 *
 * Quem chama:
 *  - funil 'abandono': o workflow "LabAzul - Promover Lead para o CRM", de 30 em
 *    30 min, so com quem preencheu ha mais de 2h SEM venda aprovada.
 *  - funil 'lista-espera': o proprio webhook de captura, na hora em que a pessoa
 *    se inscreve. Aqui nao ha compra para esperar: ela entrou na lista porque a
 *    turma esta fechada, entao o card nasce junto e o contador de dias na fila
 *    comeca a correr.
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
  const utmSource = (b.utm_source as string) || null
  const utmMedium = (b.utm_medium as string) || null
  const utmContent = (b.utm_content as string) || null
  const utmTerm = (b.utm_term as string) || null
  const evento = (b.evento as string) || 'LDF15'
  // Em qual funil o card nasce. 'abandono' continua sendo o padrao para nao
  // mudar o comportamento de quem ja chama este endpoint sem o campo.
  const funil = (b.funil as string) || 'abandono'
  const source = origemLegivel(src, utmSource, utmMedium)
  const criadoEm = b.criado_em ? new Date(b.criado_em as string) : new Date()

  // Confere a venda no momento da ingestao. O n8n ja filtra, mas o sync da Hotmart
  // pode ter rodado entre a consulta dele e esta chamada.
  //
  // Se comprou, o lead NAO entra no CRM. Ele nunca esteve no funil de recuperacao:
  // comprou sozinho. Cria-lo aqui inflaria o denominador da taxa de recuperacao
  // com gente que a equipe nunca abordou — e a metrica pareceria pior do que e.
  // Compara so com vendas A PARTIR da captura. Cliente antigo da base tem venda
  // aprovada de meses atras e mesmo assim nao comprou ESTE ingresso — ele precisa
  // entrar na fila.
  if (funil === 'lista-espera') {
    // Na lista de espera a regra e outra: quem ja tem acesso vigente ao Metodo
    // Azul nao entra na fila. Oferecer vaga a quem ja paga queima autoridade.
    // Quem comprou ha mais de um ano entra: o acesso e anual, entao e reentrada.
    if (await temMetodoAzulAtivo(email)) {
      return NextResponse.json({ ok: true, ignorado: 'já tem Método Azul ativo' })
    }
  } else if (await comprouByEmail(email, criadoEm)) {
    return NextResponse.json({ ok: true, ignorado: 'comprou depois de preencher o formulário' })
  }

  // Daqui pra baixo, o lead nao comprou: entra na fila de contato.
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
          utmSource: existing.utmSource || utmSource,
          utmMedium: existing.utmMedium || utmMedium,
          utmContent: existing.utmContent || utmContent,
          utmTerm: existing.utmTerm || utmTerm,
          evento: existing.evento || evento,
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
          utmSource,
          utmMedium,
          utmContent,
          utmTerm,
          evento,
          firstSeenAt: criadoEm,
        },
      })

  // Card na fila de contato. Stage-driven: a primeira coluna DO FUNIL, qualquer
  // que seja o nome dela hoje. O contato e unico por email e pode existir nos
  // dois funis, entao a checagem de card duplicado tambem e por funil — senao
  // quem passou pelo T15 nunca ganharia card na lista de espera.
  const estagios = await prisma.stage.findMany({
    where: { funil },
    orderBy: { position: 'asc' },
  })
  if (estagios.length) {
    const jaTemDeal = await prisma.deal.findFirst({
      where: { contactId: contact.id, stageId: { in: estagios.map((e) => e.id) } },
    })
    if (!jaTemDeal) {
      await prisma.deal.create({
        data: { contactId: contact.id, stageId: estagios[0].id, status: 'open' },
      })
    }
  }

  if (!existing) {
    await prisma.activity.create({
      data: {
        contactId: contact.id,
        type: 'sistema',
        text:
          funil === 'lista-espera'
            ? `Entrou na lista de espera (${evento})`
            : `Preencheu o formulário da página de vendas (${evento})`,
        createdAt: criadoEm,
      },
    })
  }

  return NextResponse.json({ ok: true, contactId: contact.id })
}
