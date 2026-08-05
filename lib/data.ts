import { prisma } from './prisma'
import { linkWhatsApp } from './queries'

// -----------------------------------------------------------------------------
// Camada de leitura do CRM para as telas. Server-side (usa o prisma singleton).
//
// Deliberadamente mais simples que a versao do Abel: a LabAzul tem UM funil,
// UM produto e nenhuma integracao de WhatsApp por API. Tudo que era multi-funil,
// lead score e saude de conexao foi removido — nao ha o que ligar.
// -----------------------------------------------------------------------------

export type Card = {
  dealId: string
  contactId: string
  name: string
  email: string
  phone: string | null
  whatsappLink: string | null
  source: string
  evento: string | null
  firstSeenAt: Date
  movedAt: Date
  value: number
  diasNaFila: number
}

export type Column = {
  id: string
  name: string
  color: string
  isWon: boolean
  isLost: boolean
  count: number
  total: number
  cards: Card[]
}

export type DateFilter = { start: Date | null; end: Date | null }

/** Filtro por data de entrada (firstSeenAt) do contato. */
function contactFilter(range?: DateFilter) {
  const contact: Record<string, unknown> = {}
  if (range && (range.start || range.end)) {
    const firstSeenAt: Record<string, Date> = {}
    if (range.start) firstSeenAt.gte = range.start
    if (range.end) firstSeenAt.lt = range.end
    contact.firstSeenAt = firstSeenAt
  }
  return contact
}

function dealDateWhere(range?: DateFilter) {
  const contact = contactFilter(range)
  return Object.keys(contact).length ? { contact } : {}
}

function diasDesde(d: Date): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

/** Colunas do pipeline (na ordem), com contador + R$ total e cards. */
export async function getPipeline(range?: DateFilter): Promise<Column[]> {
  const [stages, deals] = await Promise.all([
    prisma.stage.findMany({ orderBy: { position: 'asc' } }),
    prisma.deal.findMany({
      where: dealDateWhere(range),
      include: { contact: true },
      orderBy: { movedAt: 'desc' },
    }),
  ])

  return stages.map((stage) => {
    const cards: Card[] = deals
      .filter((d) => d.stageId === stage.id)
      .map((d) => {
        const c = d.contact
        return {
          dealId: d.id,
          contactId: c.id,
          name: c.name || c.email,
          email: c.email,
          phone: c.phone,
          whatsappLink: linkWhatsApp(c.phone),
          source: c.source || 'Direto',
          evento: c.evento,
          firstSeenAt: c.firstSeenAt,
          movedAt: d.movedAt,
          value: Number(d.value),
          diasNaFila: diasDesde(d.movedAt),
        }
      })

    // Mais antigo primeiro: num funil de recuperacao, quem esta esperando ha mais
    // tempo e quem esfria. A ordem da coluna e a ordem de trabalho do dia.
    cards.sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime())

    return {
      id: stage.id,
      name: stage.name,
      color: stage.color || '#071747',
      isWon: stage.isWon,
      isLost: stage.isLost,
      count: cards.length,
      total: cards.reduce((s, c) => s + c.value, 0),
      cards,
    }
  })
}

export type ContactRow = {
  id: string
  name: string
  email: string
  phone: string | null
  whatsappLink: string | null
  source: string
  evento: string | null
  firstSeenAt: Date
  isCliente: boolean
  ltv: number
  updatedAt: Date
}

export async function getContacts(opts: { tab?: string; q?: string }): Promise<ContactRow[]> {
  const { tab, q } = opts
  const where: Record<string, unknown> = {}
  if (tab === 'clientes') where.isCliente = true
  if (tab === 'leads') where.isCliente = false
  if (q && q.trim()) {
    const term = q.trim()
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term.replace(/\D/g, '') || term } },
    ]
  }
  const rows = await prisma.contact.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 500,
  })
  return rows.map((c) => ({
    id: c.id,
    name: c.name || c.email,
    email: c.email,
    phone: c.phone,
    whatsappLink: linkWhatsApp(c.phone),
    source: c.source || 'Direto',
    evento: c.evento,
    firstSeenAt: c.firstSeenAt,
    isCliente: c.isCliente,
    ltv: Number(c.ltv),
    updatedAt: c.updatedAt,
  }))
}

export async function getContact(id: string) {
  return prisma.contact.findUnique({
    where: { id },
    include: {
      activities: { orderBy: { createdAt: 'desc' } },
      deals: { include: { stage: true }, orderBy: { movedAt: 'desc' } },
    },
  })
}

export async function getStages() {
  return prisma.stage.findMany({ orderBy: { position: 'asc' } })
}

export type Analytics = {
  totalContatos: number
  totalCompraram: number
  naFila: number
  taxaRecuperacao: number
  receita: number
  porFonte: { source: string; total: number; compraram: number }[]
}

/**
 * Numeros do funil de recuperacao.
 *
 * `taxaRecuperacao` conta apenas quem entrou na fila e depois comprou — ou seja,
 * o resultado do trabalho da equipe. Quem comprou sozinho nos primeiros minutos
 * nunca entra no CRM, entao nao infla a conta.
 */
export async function getAnalytics(range?: DateFilter): Promise<Analytics> {
  const where = contactFilter(range)
  const [total, compraram, receitaAgg, fontes, fontesCliente] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.count({ where: { ...where, isCliente: true } }),
    prisma.contact.aggregate({ _sum: { ltv: true }, where: { ...where, isCliente: true } }),
    prisma.contact.groupBy({ by: ['source'], where, _count: { _all: true } }),
    prisma.contact.groupBy({
      by: ['source'],
      where: { ...where, isCliente: true },
      _count: { _all: true },
    }),
  ])

  const compradosPorFonte = new Map(fontesCliente.map((f) => [f.source, f._count._all]))

  return {
    totalContatos: total,
    totalCompraram: compraram,
    naFila: total - compraram,
    taxaRecuperacao: total > 0 ? compraram / total : 0,
    receita: Number(receitaAgg._sum.ltv ?? 0),
    porFonte: fontes
      .map((f) => ({
        source: f.source || 'Direto',
        total: f._count._all,
        compraram: compradosPorFonte.get(f.source) ?? 0,
      }))
      .sort((a, b) => b.total - a.total),
  }
}
