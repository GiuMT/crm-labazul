// Helpers de formatacao (moeda BR, data, telefone/WhatsApp).

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

export function money(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value ?? 0
  return BRL.format(Number.isFinite(n as number) ? (n as number) : 0)
}

export function dateShort(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(date)
}

/** "hoje" / "ontem" / dd/mm/aa — usado na coluna "Atualizado". */
export function relativeDay(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  const today = new Date()
  const diff = Math.floor(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) /
      86400000
  )
  if (diff <= 0) return 'hoje'
  if (diff === 1) return 'ontem'
  if (diff < 7) return `${diff} dias`
  return dateShort(date)
}

/**
 * Rotulo curto da pagina de origem, para o card do pipeline.
 *
 * O `evento` guarda o lancamento inteiro (LDF15, LDF15-V3), mas na tela isso
 * e ruido: e sempre o mesmo lancamento. O que a equipe precisa ver de relance
 * e de QUAL PAGINA o lead veio, porque cada uma recebe uma abordagem diferente.
 *
 *   LDF15     -> v1   (pagina original, sem sufixo)
 *   LDF15-V3  -> v3
 *
 * Le o sufixo em vez de usar uma lista fixa: uma v4 amanha funciona sozinha.
 */
export function paginaDoEvento(evento: string | null | undefined): string | null {
  if (!evento) return null
  const m = /-v(\d+)$/i.exec(evento.trim())
  if (m) return `v${m[1]}`
  return 'v1'
}

/**
 * Papel da pessoa no laboratorio, respondido no pop-up da lista de espera
 * (desde 15/09/2026). O banco guarda o codigo curto, nunca o texto da opcao:
 * assim a copy da pergunta pode mudar sem quebrar a leitura dos leads antigos.
 *
 * `decisor` marca quem assina a compra. E o que muda a abordagem: com dono e
 * gestor a conversa e de oferta; com os outros dois, e outra conversa.
 */
export const PAPEIS: Record<string, { label: string; decisor: boolean }> = {
  dono: { label: 'Dono ou sócio', decisor: true },
  gestor: { label: 'Gestor ou RT', decisor: true },
  funcionario: { label: 'Funcionário', decisor: false },
  'vai-abrir': { label: 'Vai abrir lab', decisor: false },
}

export function papelLegivel(papel: string | null | undefined): string | null {
  if (!papel) return null
  return PAPEIS[papel]?.label || papel
}

/**
 * Normaliza telefone BR pra link do WhatsApp (wa.me/55...).
 * Aceita so digitos; garante DDI 55; insere o 9 em celular antigo (10 digitos com DDD).
 * Retorna null se invalido (nao gera link quebrado).
 */
export function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('55')) d = d.slice(2)
  // remove zeros de operadora / DDD com 0 na frente
  d = d.replace(/^0+/, '')
  if (d.length === 10) {
    // DDD (2) + 8 digitos -> insere o 9
    d = d.slice(0, 2) + '9' + d.slice(2)
  }
  if (d.length !== 11) return null // invalido
  return `https://wa.me/55${d}`
}
