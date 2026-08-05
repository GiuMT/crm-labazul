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
