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
  criativo: string | null
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
          criativo: c.utmContent,
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
  naFila: number
  abordados: number
  compraram: number
  perdidos: number
  taxaConversao: number
  receita: number
  porFonte: { source: string; total: number; compraram: number }[]
  porPublico: { publico: string; total: number; compraram: number }[]
  porEvento: { evento: string; total: number; compraram: number; taxa: number; receita: number }[]
}

/**
 * Quantas colunas do começo de cada funil são "fila": card que ainda não foi
 * abordado. No abandono é só "Pronto para contato"; na lista de espera são
 * "Novo lead" e "Pronto para contato". Contado por ordem, nunca pelo nome.
 */
export const COLUNAS_FILA: Record<string, number> = {
  abandono: 1,
  'lista-espera': 2,
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
 * Publico da campanha, lido da utm_campaign. A marcacao chega de dois jeitos:
 * "[F][INJML0826][VENDAS][PQ][V3]" no T15 e "FINJML0826LEADSPQ-Lista-de-Espera"
 * na lista de espera (a UTM perde os colchetes). Em ambos o PQ/PF termina num
 * separador ou no fim do texto. Sem marcacao (stories, bio, WhatsApp) fica
 * como "Sem PQ/PF", que e uma afirmacao, nao um buraco.
 */
export function publicoDe(campaign: string | null | undefined): string {
  const m = String(campaign || '').toUpperCase().match(/P([QF])(?=[\]\-_\s]|$)/)
  if (!m) return 'Sem PQ/PF'
  return m[1] === 'Q' ? 'PQ (público quente)' : 'PF (público frio)'
}

/**
 * Numeros de UM funil, contados a partir dos cards (deals) daquele funil.
 *
 * Tem que ser por card, e nao por contato: o contato e unico por e-mail e pode
 * estar nos dois funis, e o `isCliente`/`ltv` dele e um so. Contar por contato
 * misturava a lista de espera nos numeros do abandono (e vice-versa).
 *
 * Base das taxas = quem a equipe ja abordou. Quem esta parado na fila ainda
 * nao foi trabalhado; inclui-lo faria a taxa parecer pior do que e.
 */
export async function getAnalytics(range?: DateFilter, funil: string = FUNIL_PADRAO): Promise<Analytics> {
  const stages = await prisma.stage.findMany({ where: { funil }, orderBy: { position: 'asc' } })
  const deals = await prisma.deal.findMany({
    where: { ...dealDateWhere(range), stageId: { in: stages.map((s) => s.id) } },
    include: { contact: true },
  })

  const idsFila = new Set(
    stages
      .filter((s) => !s.isWon && !s.isLost)
      .slice(0, COLUNAS_FILA[funil] ?? 1)
      .map((s) => s.id)
  )
  const idsGanho = new Set(stages.filter((s) => s.isWon).map((s) => s.id))
  const idsPerda = new Set(stages.filter((s) => s.isLost).map((s) => s.id))

  const ganhos = deals.filter((d) => idsGanho.has(d.stageId))
  const naFila = deals.filter((d) => idsFila.has(d.stageId)).length
  const compraram = ganhos.length
  const perdidos = deals.filter((d) => idsPerda.has(d.stageId)).length
  const abordados = deals.length - naFila

  const agrupa = (chave: (d: (typeof deals)[number]) => string) => {
    const m = new Map<string, { total: number; compraram: number; receita: number }>()
    for (const d of deals) {
      const k = chave(d)
      const g = m.get(k) ?? { total: 0, compraram: 0, receita: 0 }
      g.total += 1
      if (idsGanho.has(d.stageId)) {
        g.compraram += 1
        g.receita += Number(d.value)
      }
      m.set(k, g)
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
  }

  return {
    totalContatos: deals.length,
    naFila,
    abordados,
    compraram,
    perdidos,
    taxaConversao: abordados > 0 ? compraram / abordados : 0,
    receita: ganhos.reduce((s, d) => s + Number(d.value), 0),
    porFonte: agrupa((d) => d.contact.source || 'Direto').map(([source, g]) => ({
      source,
      total: g.total,
      compraram: g.compraram,
    })),
    porPublico: agrupa((d) => publicoDe(d.contact.campaign)).map(([publico, g]) => ({
      publico,
      total: g.total,
      compraram: g.compraram,
    })),
    porEvento: agrupa((d) => d.contact.evento || '(sem página)').map(([evento, g]) => ({
      evento,
      total: g.total,
      compraram: g.compraram,
      taxa: g.total > 0 ? g.compraram / g.total : 0,
      receita: g.receita,
    })),
  }
}
