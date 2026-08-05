import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Cria uma atividade (nota/tarefa) na timeline de um contato.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { contactId, type, text } = await req.json().catch(() => ({}))
  if (!contactId || !type || !text) {
    return NextResponse.json(
      { error: 'contactId, type e text sao obrigatorios' },
      { status: 400 }
    )
  }

  await prisma.activity.create({ data: { contactId, type, text } })
  return NextResponse.json({ ok: true })
}
