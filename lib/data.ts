import { prisma } from './prisma'
import { linkWhatsApp } from './queries'

// -----------------------------------------------------------------------------
// Camada de leitura do CRM para as telas. Server-side (usa o prisma singleton).
//
// A LabAzul comecou com UM funil (abandono de carrinho do T15). Em 09/09/2026
// entrou o segundo: a lista de espera do Metodo Azul perpetuo. Os dois vivem
// no mesmo quadro, separados pela coluna `funil` de crm.stages — nunca pelo
// nome do estagio, que continua editavel por UPDATE sem redeploy.
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

/** Os funis existentes, na ordem em que aparecem no seletor da tela. */
export const FUNIS = [
  { key: 'lista-espera', label: 'Lista de espera' },
  { key: 'abandono', label: 'Abandono T15' },
] as const

export const FUNIL_PADRAO = 'lista-espera'

/** Titulo da tela por funil. A fila da lista de espera nao e "recuperacao". */
export const TITULO_FUNIL: Record<string, string> = {
  'lista-espera': 'Lista de espera do Método Azul',
  abandono: 'Fila de recuperação',
}

/** Colunas do pipeline (na ordem), com contador + R$ total e cards. */
export async function getPipeline(range?: DateFilter, funil: string = FUNIL_PADRAO): Promise<Column[]> {
  const stagesDoFunil = await prisma.stage.findMany({
    where: { funil },
    orderBy: { position: 'asc' },
  })
  const [stages, deals] = await Promise.all([
    Promise.resolve(stagesDoFunil),
    prisma.deal.findMany({
      where: { ...dealDateWhere(range), stageId: { in: stagesDoFunil.map((s) => s.id) } },
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
  porEvento: { evento: string; total: number; compraram: number; taxa: number; receita: number }[]
}

/**
 * Rótulo legível de cada página + a abordagem de WhatsApp que ela recebe.
 * É um teste A/B: cada página manda os leads para uma abordagem diferente.
 * Ao trocar a abordagem, atualizar aqui — é só texto de tela.
 */
export const ABORDAGEM: Record<string, string> = {
  LDF15: 'Página v1 · bônus extra',
  'LDF15-V3': 'Página v3 · desconto do lote anterior',
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

  // Comparativo por página de origem — o teste A/B das abordagens de WhatsApp.
  // A base e o total de quem ENTROU NA FILA (ou seja, nao comprou sozinho);
  // e sobre esses que a abordagem age, entao e a base honesta da comparacao.
  const [eventos, eventosCliente, receitaEvento] = await Promise.all([
    prisma.contact.groupBy({ by: ['evento'], where, _count: { _all: true } }),
    prisma.contact.groupBy({
      by: ['evento'],
      where: { ...where, isCliente: true },
      _count: { _all: true },
    }),
    prisma.contact.groupBy({
      by: ['evento'],
      where: { ...where, isCliente: true },
      _sum: { ltv: true },
    }),
  ])
  const compradosPorEvento = new Map(eventosCliente.map((e) => [e.evento, e._count._all]))
  const receitaPorEvento = new Map(receitaEvento.map((e) => [e.evento, Number(e._sum.ltv ?? 0)]))

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
    porEvento: eventos
      .map((e) => {
        const total = e._count._all
        const compraram = compradosPorEvento.get(e.evento) ?? 0
        return {
          evento: e.evento || '(sem página)',
          total,
          compraram,
          taxa: total > 0 ? compraram / total : 0,
          receita: receitaPorEvento.get(e.evento) ?? 0,
        }
      })
      .sort((a, b) => b.total - a.total),
  }
}
