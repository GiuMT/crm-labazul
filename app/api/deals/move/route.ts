import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ltvByEmail } from '@/lib/queries'

// Move um deal pra outro estagio. Ajusta o status (won/lost/open) pela flag do estagio destino.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { dealId, stageId } = await req.json().catch(() => ({}))
  if (!dealId || !stageId) {
    return NextResponse.json({ error: 'dealId e stageId sao obrigatorios' }, { status: 400 })
  }

  const stage = await prisma.stage.findUnique({ where: { id: stageId } })
  if (!stage) return NextResponse.json({ error: 'estagio inexistente' }, { status: 404 })

  const status = stage.isWon ? 'won' : stage.isLost ? 'lost' : 'open'

  const deal = await prisma.deal.update({
    where: { id: dealId },
    data: { stageId, status, movedAt: new Date() },
  })

  // O contato precisa acompanhar o card. Sem isto, arrastar para "Comprou"
  // mudava so a coluna e o `isCliente` ficava false — a taxa de recuperacao
  // na Analytics mostraria zero para sempre, sem nenhum sinal de erro.
  const contato = await prisma.contact.findUnique({ where: { id: deal.contactId } })
  if (contato) {
    if (stage.isWon) {
      // O valor vem da venda real na Hotmart, nao digitado a mao.
      // So conta venda A PARTIR da entrada na fila: compra antiga de cliente
      // da base nao e receita recuperada por esta acao.
      // Se o sync ainda nao trouxe a venda, o LTV fica 0 e se corrige
      // na proxima vez que alguem mover o card.
      const ltv = await ltvByEmail(contato.email, contato.firstSeenAt).catch(() => 0)
      await prisma.contact.update({
        where: { id: contato.id },
        data: { isCliente: true, ltv },
      })
      if (ltv > 0) await prisma.deal.update({ where: { id: deal.id }, data: { value: ltv } })
    } else if (contato.isCliente) {
      // Saiu da coluna de ganho (correcao de engano, reembolso): desfaz.
      await prisma.contact.update({
        where: { id: contato.id },
        data: { isCliente: false, ltv: 0 },
      })
    }
  }

  await prisma.activity.create({
    data: {
      contactId: deal.contactId,
      type: 'sistema',
      text: `Movido para "${stage.name}"`,
    },
  })

  return NextResponse.json({ ok: true })
}
