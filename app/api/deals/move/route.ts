import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

  // registra na timeline
  await prisma.activity.create({
    data: {
      contactId: deal.contactId,
      type: 'sistema',
      text: `Movido para "${stage.name}"`,
    },
  })

  return NextResponse.json({ ok: true })
}
