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

/**
 * O produto que define a conversao: o INGRESSO da Imersao "O Novo Jogo" (T15).
 *
 * Nao basta "teve alguma venda". A LabAzul vende dezenas de produtos, e alguem
 * pode preencher o formulario do evento e comprar um Guia de Atendimento no dia
 * seguinte — isso nao e conversao do ingresso, e a pessoa continua na fila.
 */
export const PRODUTO_INGRESSO = '8178584' // Imersao O Novo Jogo do Mercado de Laboratorios

/**
 * Order bump do mesmo checkout (gravacao). Nao conta como conversao — so se
 * compra junto com o ingresso —, mas entra na receita recuperada.
 */
export const PRODUTO_BUMP = '8178709' // ... (Gravacao)

/**
 * O produto que define a conversao do funil de LISTA DE ESPERA: o proprio
 * Metodo Azul. Aqui nao ha ingresso no meio — quem entra na lista esta
 * esperando vaga no programa, e a conversao e a compra dele.
 */
export const PRODUTO_METODO_AZUL = '7237713' // Metodo Azul

/** Produto que conta como conversao em cada funil. */
export const PRODUTO_CONVERSAO: Record<string, string> = {
  abandono: PRODUTO_INGRESSO,
  'lista-espera': PRODUTO_METODO_AZUL,
}

/**
 * True se o email tem acesso VIGENTE ao Metodo Azul (compra aprovada nos
 * ultimos 12 meses). Quem esta nessa condicao nao entra na fila da lista de
 * espera: oferecer vaga a quem ja paga queima autoridade na hora.
 *
 * Quem comprou ha mais de um ano NAO e barrado de proposito — o acesso e
 * anual, entao ele e reentrada, e reentrada e lead quente.
 */
export async function temMetodoAzulAtivo(email: string): Promise<boolean> {
  const vendas = await getVendasByEmail(email)
  const corte = Date.now() - 365 * 24 * 60 * 60 * 1000
  return vendas.some(
    (v) =>
      VALID_SALE_STATUS.includes(v.status) &&
      String(v.product_id) === PRODUTO_METODO_AZUL &&
      new Date(v.order_date).getTime() >= corte
  )
}

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

/**
 * Vendas aprovadas a partir de uma data de referencia.
 *
 * O `desde` e obrigatorio na pratica e existe por um motivo que custou caro:
 * a LabAzul tem base antiga (Metodo Azul, Socio, produtos avulsos). Um cliente
 * de 2024 que preenche o formulario hoje TEM venda aprovada — mas nao comprou
 * ESTE ingresso. Sem o corte por data, ele era tratado como comprador e ficava
 * de fora da fila de recuperacao. E justamente o lead mais quente que existe:
 * ja confia na marca e levantou a mao de novo.
 *
 * A tolerancia de 1 dia para tras cobre diferenca de fuso e o intervalo entre
 * a pessoa comprar e o sync da Hotmart registrar.
 */
function aprovadasDesde(vendas: Venda[], desde: Date | null | undefined, produtos: string[]): Venda[] {
  const corte = desde ? new Date(desde).getTime() - 24 * 60 * 60 * 1000 : -Infinity
  return vendas.filter(
    (v) =>
      VALID_SALE_STATUS.includes(v.status) &&
      produtos.includes(String(v.product_id)) &&
      new Date(v.order_date).getTime() >= corte
  )
}

/** True se o email comprou o INGRESSO do T15 a partir de `desde` (=> sai da fila). */
export async function comprouByEmail(email: string, desde?: Date | null): Promise<boolean> {
  const vendas = await getVendasByEmail(email)
  return aprovadasDesde(vendas, desde, [PRODUTO_INGRESSO]).length > 0
}

/**
 * Receita recuperada, a partir de `desde`.
 *
 * Os produtos dependem do funil: no de abandono conta o ingresso do T15 mais o
 * order bump da gravacao; na lista de espera conta o Metodo Azul. Somar tudo em
 * um so lugar misturaria receita de R$ 59 com receita de R$ 3.600.
 */
export async function ltvByEmail(
  email: string,
  desde?: Date | null,
  produtos: string[] = [PRODUTO_INGRESSO, PRODUTO_BUMP]
): Promise<number> {
  const vendas = await getVendasByEmail(email)
  return aprovadasDesde(vendas, desde, produtos).reduce((s, v) => s + Number(v.price_value || 0), 0)
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
                 and v.product_id::text = $3
                 and v.order_date >= l.criado_em - interval '1 day'
            )
      order by l.criado_em desc`,
    String(horas),
    VALID_SALE_STATUS,
    PRODUTO_INGRESSO
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
