import { prisma } from './prisma'

// -----------------------------------------------------------------------------
// Leitura CRUA das bases de marketing que ja existem no banco 'labazul'.
// NAO duplicamos esses dados no CRM — lemos por SQL cru quando precisamos cruzar.
// Como o DATABASE_URL aponta pro schema 'crm', referenciamos 'public.' explicitamente.
//
// Fontes:
//   public.vendas        — 1 linha por transacao Hotmart (sync de hora em hora)
//   public.leads_captura — 1 linha por preenchimento do modal da pagina T15
// -----------------------------------------------------------------------------

/** Normaliza email pra chave de deduplicacao (sempre lower + trim). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Status que contam como venda valida no Hotmart. Os unicos presentes na base hoje. */
export const VALID_SALE_STATUS = ['APPROVED', 'COMPLETE', 'COMPLETED']

/** Janela em horas que o lead espera antes de virar fila de contato (ver SPEC §5). */
export const JANELA_HORAS = 2

export type Venda = {
  transaction: string
  order_date: Date
  approved_date: Date | null
  status: string
  product_id: string // bigint vem como string
  product_name: string | null
  price_value: string // Decimal vem como string
  buyer_name: string | null
  buyer_email: string | null
  tracking_source: string | null
  lancamento: string | null
  fonte: string | null
  criativo: string | null
}

const SELECT_VENDA = `
  select transaction, order_date, approved_date, status,
         product_id::text as product_id, product_name, price_value,
         buyer_name, buyer_email, tracking_source, lancamento, fonte, criativo
    from public.vendas`

/** Todas as vendas de um email, mais recentes primeiro. */
export async function getVendasByEmail(email: string): Promise<Venda[]> {
  const e = normalizeEmail(email)
  return prisma.$queryRawUnsafe<Venda[]>(
    `${SELECT_VENDA}
      where lower(trim(buyer_email)) = $1
      order by order_date desc`,
    e
  )
}

/** True se o email tem ao menos 1 venda aprovada (=> comprou, sai da fila). */
export async function comprouByEmail(email: string): Promise<boolean> {
  const vendas = await getVendasByEmail(email)
  return vendas.some((v) => VALID_SALE_STATUS.includes(v.status))
}

/** Soma das vendas aprovadas do email — o LTV do contato. */
export async function ltvByEmail(email: string): Promise<number> {
  const vendas = await getVendasByEmail(email)
  return vendas
    .filter((v) => VALID_SALE_STATUS.includes(v.status))
    .reduce((soma, v) => soma + Number(v.price_value || 0), 0)
}

export type LeadPendente = {
  email: string
  nome: string
  whatsapp: string | null
  src: string | null
  sck: string | null
  utm_campaign: string | null
  evento: string
  criado_em: Date
}

/**
 * O coracao do CRM: quem preencheu o modal ha mais de JANELA_HORAS
 * e NAO tem nenhuma venda aprovada. Esta e a fila de contato.
 *
 * A janela existe porque o modal fica imediatamente antes do checkout —
 * a maioria preenche e compra em minutos. Alem disso o sync da Hotmart
 * roda de hora em hora, entao uma janela curta traria comprador
 * que o banco ainda nao conhece. Ver SPEC §5.
 */
export async function getLeadsPendentes(horas = JANELA_HORAS): Promise<LeadPendente[]> {
  return prisma.$queryRawUnsafe<LeadPendente[]>(
    `select l.email, l.nome, l.whatsapp, l.src, l.sck, l.utm_campaign,
            l.evento, l.criado_em
       from public.leads_captura l
      where l.criado_em <= now() - ($1 || ' hours')::interval
        and not exists (
              select 1
                from public.vendas v
               where lower(trim(v.buyer_email)) = lower(trim(l.email))
                 and v.status = any($2)
                 and v.order_date >= l.criado_em - interval '1 day'
            )
      order by l.criado_em desc`,
    String(horas),
    VALID_SALE_STATUS
  )
}

/** Todos os leads capturados, para o seed inicial e para a tela de Analytics. */
export async function getTodosLeads(): Promise<LeadPendente[]> {
  return prisma.$queryRawUnsafe<LeadPendente[]>(
    `select email, nome, whatsapp, src, sck, utm_campaign, evento, criado_em
       from public.leads_captura
      order by criado_em desc`
  )
}

/**
 * Traduz o rastreio cru numa origem legivel para o card.
 * Regra do guia: listar todas as origens explicitamente, nunca deixar
 * cair num 'unknown' silencioso — por isso o fallback e "Direto",
 * que e uma afirmacao, nao um buraco.
 */
export function origemLegivel(src: string | null | undefined): string {
  const s = (src || '').toLowerCase()
  if (!s) return 'Direto'
  if (s.includes('meta') || s.includes('face') || s.includes('ig') || s.includes('insta')) return 'Meta Ads'
  if (s.includes('google') || s.includes('gads') || s.includes('yt')) return 'Google'
  if (s.includes('wpp') || s.includes('whats')) return 'WhatsApp'
  if (s.includes('email') || s.includes('mail')) return 'E-mail'
  if (s.includes('organ') || s.includes('bio')) return 'Orgânico'
  return src as string
}

/** Monta o deep-link de WhatsApp a partir do numero ja normalizado pelo modal. */
export function linkWhatsApp(numero: string | null | undefined): string | null {
  const d = String(numero || '').replace(/\D/g, '')
  if (d.length < 12 || d.length > 13) return null // 55 + DDD + 8 ou 9 digitos
  return `https://wa.me/${d}`
}
