import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeEmail, origemLegivel } from '@/lib/queries'

// Ingestao de VENDA (Hotmart -> n8n -> aqui). Protegido por x-ingest-token.
//
// ⚠️ ESCRITO MAS NAO LIGADO (SPEC §7): na v1 a equipe marca "Comprou" na mao,
// arrastando o card. Este endpoint fica pronto para quando quisermos automatizar —
// basta acrescentar um no HTTP no workflow "Hotmart Sync - Cron Diario".
// Marca o contato como cliente, soma LTV (idempotente!) e move o deal pra "Cliente".
export async function POST(req: Request) {
  if (req.headers.get('x-ingest-token') !== process.env.INGEST_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  const rawEmail = (b.email as string) || ''
  if (!rawEmail.trim()) {
    return NextResponse.json({ error: 'email obrigatorio' }, { status: 400 })
  }
  const email = normalizeEmail(rawEmail)
  const name = (b.name as string) || null
  const value = Number(b.value) || 59 // ingresso da Imersao = R$ 59
  const src = (b.src as string) || null
  const source = origemLegivel(src)
  const productName = (b.productName as string) || (b.product_name as string) || 'Imersão Lab do Futuro'
  const transaction = (b.transaction as string) || productName
  const phoneDigits = ((b.phone as string) || '').replace(/\D/g, '')

  // upsert do contato. Chave primaria = e-mail; mas e comum a pessoa se cadastrar com um
  // e-mail e COMPRAR com outro — nesse caso cai no fallback por TELEFONE (DDD + 8 ultimos
  // digitos, robusto ao 9o digito), senao criariamos um contato duplicado e o lead original
  // continuaria na fila de abordagem mesmo ja tendo comprado.
  let existing = await prisma.contact.findUnique({ where: { email } })
  if (!existing && phoneDigits.length >= 10) {
    const porFone = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `select id from crm.contacts
        where length(regexp_replace(coalesce(phone,''), '\\D', '', 'g')) >= 10
          and right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 8) = right($1, 8)
          and substring(right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 11) from 1 for 2)
              = substring(right($1, 11) from 1 for 2)
        order by "firstSeenAt" asc
        limit 1`,
      phoneDigits
    )
    if (porFone.length) {
      existing = await prisma.contact.findUnique({ where: { id: porFone[0].id } })
    }
  }
  const base = existing
    ? await prisma.contact.update({
        where: { id: existing.id }, // por id (nao por email): no match por telefone o e-mail difere
        data: {
          name: existing.name || name,
          src: existing.src || src,
          source: existing.source || source,
          phone: existing.phone || (phoneDigits || null),
        },
      })
    : await prisma.contact.create({ data: { email, name, src, source, phone: phoneDigits || null } })

  // Idempotencia: a activity 'compra' tem indice unico parcial (contactId,text).
  // Se ja existe (webhook repetido / parcelamento), o create falha -> nao soma LTV de novo.
  const compraText = `Compra ${transaction}`
  let firstTime = false
  try {
    await prisma.activity.create({ data: { contactId: base.id, type: 'compra', text: compraText } })
    firstTime = true
  } catch {
    firstTime = false
  }

  // marca cliente + soma LTV so na 1a vez
  const contact = await prisma.contact.update({
    where: { id: base.id },
    data: { isCliente: true, ...(firstTime ? { ltv: { increment: value } } : {}) },
  })

  // move o deal pro estagio "Cliente" certo conforme o src da VENDA:
  // "via funil" (inside sales) = src contendo "is-g" ou "crm-r" (recuperacao/perpetuo)
  // OU "is-le" (lista de espera); qualquer outro = compra direta.
  // Match por substring do nome (robusto a acento): "recupera" x "direto".
  const srcLower = (src || '').toLowerCase()
  const isRecuperacao =
    srcLower.includes('is-g') || srcLower.includes('crm-r') || srcLower.includes('is-le')
  const wonStages = await prisma.stage.findMany({ where: { isWon: true } })
  const wonStage =
    wonStages.find((s) => {
      const n = s.name.toLowerCase()
      return isRecuperacao ? n.includes('recupera') : n.includes('direto')
    }) ?? wonStages[0]
  if (wonStage) {
    const deal = await prisma.deal.findFirst({ where: { contactId: contact.id }, orderBy: { createdAt: 'asc' } })
    if (deal) {
      await prisma.deal.update({
        where: { id: deal.id },
        data: { stageId: wonStage.id, status: 'won', value, movedAt: new Date() },
      })
    } else {
      await prisma.deal.create({ data: { contactId: contact.id, stageId: wonStage.id, status: 'won', value } })
    }
  }

  return NextResponse.json({ ok: true, contactId: contact.id, counted: firstTime })
}
