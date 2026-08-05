// -----------------------------------------------------------------------------
// Intervalo de datas para o filtro do funil (Pipeline + Analytics).
// Filtra pela DATA DE ENTRADA do lead (contacts.firstSeenAt).
// Boundaries calculados no fuso BR (America/Sao_Paulo, UTC-3 fixo desde 2019).
// -----------------------------------------------------------------------------

export type RangeKey =
  | 'tudo'
  | 'hoje'
  | 'ontem'
  | '7d'
  | '30d'
  | 'este-mes'
  | 'mes-passado'
  | 'custom'

export type DateRange = {
  key: RangeKey
  /** início inclusivo (instante UTC de 00:00 BR) ou null = sem limite */
  start: Date | null
  /** fim exclusivo (instante UTC de 00:00 BR do dia seguinte) ou null = sem limite */
  end: Date | null
  /** rótulo humano do período (para exibir na tela) */
  label: string
  /** valores crus dos inputs custom (YYYY-MM-DD), para repovoar o formulário */
  de?: string
  ate?: string
}

const TZ = 'America/Sao_Paulo'
const BR_OFFSET_H = 3 // UTC-3 fixo (Brasil aboliu horário de verão em 2019)

/** "Hoje" no fuso BR, como componentes de ano/mês/dia. */
function brToday(): { y: number; m: number; d: number } {
  const iso = new Date().toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

/** Instante UTC correspondente a 00:00 do fuso BR do dia informado. */
function brMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, BR_OFFSET_H, 0, 0))
}

function addDays(dt: Date, days: number): Date {
  return new Date(dt.getTime() + days * 86400000)
}

function fmt(dt: Date): string {
  // dd/mm/aa no fuso BR
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(dt)
}

/** Rótulo "01/07/26 – 31/07/26" a partir de start/end (end é exclusivo). */
function rangeLabel(start: Date, end: Date): string {
  const lastDay = addDays(end, -1)
  return `${fmt(start)} – ${fmt(lastDay)}`
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/**
 * Resolve o intervalo a partir dos search params da URL.
 * `?range=<preset>` ou `?de=YYYY-MM-DD&ate=YYYY-MM-DD` (custom).
 * Sem params => 'tudo' (sem limite).
 */
export function parseRange(sp: Record<string, string | string[] | undefined>): DateRange {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const de = one(sp.de)
  const ate = one(sp.ate)
  const rangeParam = one(sp.range) as RangeKey | undefined

  // Custom tem prioridade se ambos vierem válidos
  if (de && ate && /^\d{4}-\d{2}-\d{2}$/.test(de) && /^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    const [dy, dm, dd] = de.split('-').map(Number)
    const [ay, am, ad] = ate.split('-').map(Number)
    const start = brMidnight(dy, dm, dd)
    const end = addDays(brMidnight(ay, am, ad), 1) // fim inclusivo
    return { key: 'custom', start, end, label: rangeLabel(start, end), de, ate }
  }

  const t = brToday()

  switch (rangeParam) {
    case 'hoje': {
      const start = brMidnight(t.y, t.m, t.d)
      const end = addDays(start, 1)
      return { key: 'hoje', start, end, label: 'Hoje' }
    }
    case 'ontem': {
      const end = brMidnight(t.y, t.m, t.d) // 00:00 de hoje = fim exclusivo
      const start = addDays(end, -1) // 00:00 de ontem
      return { key: 'ontem', start, end, label: 'Ontem' }
    }
    case '7d': {
      const end = addDays(brMidnight(t.y, t.m, t.d), 1)
      const start = addDays(end, -7)
      return { key: '7d', start, end, label: 'Últimos 7 dias' }
    }
    case '30d': {
      const end = addDays(brMidnight(t.y, t.m, t.d), 1)
      const start = addDays(end, -30)
      return { key: '30d', start, end, label: 'Últimos 30 dias' }
    }
    case 'este-mes': {
      const start = brMidnight(t.y, t.m, 1)
      const end = t.m === 12 ? brMidnight(t.y + 1, 1, 1) : brMidnight(t.y, t.m + 1, 1)
      return { key: 'este-mes', start, end, label: `${MESES[t.m - 1]} ${t.y}` }
    }
    case 'mes-passado': {
      const pm = t.m === 1 ? 12 : t.m - 1
      const py = t.m === 1 ? t.y - 1 : t.y
      const start = brMidnight(py, pm, 1)
      const end = brMidnight(t.y, t.m, 1)
      return { key: 'mes-passado', start, end, label: `${MESES[pm - 1]} ${py}` }
    }
    default:
      return { key: 'tudo', start: null, end: null, label: 'Todo o período' }
  }
}
