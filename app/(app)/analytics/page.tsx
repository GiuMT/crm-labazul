import { getAnalytics, getPipeline } from '@/lib/data'
import { parseRange } from '@/lib/daterange'
import { money } from '@/lib/format'
import DateFilter from '@/components/DateFilter'

export const dynamic = 'force-dynamic'

function Stat({
  label,
  value,
  hint,
  color = 'text-marca-azul',
}: {
  label: string
  value: string
  hint?: string
  color?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const range = parseRange(searchParams)
  const filter = { start: range.start, end: range.end }
  const [a, columns] = await Promise.all([getAnalytics(filter), getPipeline(filter)])
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`

  // Leitura stage-driven: nunca comparar pelo nome do estágio (o guia é explícito).
  // Posição 1 = fila; isWon = comprou; isLost = perdido; o meio é o que foi trabalhado.
  const naFila = columns.find((c) => !c.isWon && !c.isLost)?.count ?? 0
  const trabalhados = columns
    .filter((c) => !c.isWon && !c.isLost)
    .slice(1)
    .reduce((s, c) => s + c.count, 0)
  const compraram = columns.filter((c) => c.isWon).reduce((s, c) => s + c.count, 0)
  const perdidos = columns.filter((c) => c.isLost).reduce((s, c) => s + c.count, 0)

  // Base das taxas = quem a equipe efetivamente abordou. Quem está parado na fila
  // ainda não foi trabalhado; incluí-lo faria a taxa parecer pior do que é.
  const abordados = trabalhados + compraram + perdidos
  const taxaConversao = abordados > 0 ? compraram / abordados : 0

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-marca-azul">Analytics</h1>
        <p className="text-sm text-slate-500">
          Recuperação do ingresso · por data de entrada · {range.label}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <DateFilter />
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase text-slate-500">Funil de recuperação</h2>
          <p className="mb-3 text-xs text-slate-400">
            As taxas usam como base <b>quem já foi abordado</b>. Quem está parado na fila ainda não
            foi trabalhado e não entra na conta.
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Stat
              label="No CRM"
              value={String(a.totalContatos)}
              hint="preencheram e não compraram na hora"
            />
            <Stat label="Na fila" value={String(naFila)} hint="ainda não abordados" />
            <Stat label="Abordados" value={String(abordados)} hint="base das taxas" />
            <Stat
              label="Recuperados"
              value={String(compraram)}
              hint="compraram depois do contato"
              color="text-ganho"
            />
            <Stat label="Perdidos" value={String(perdidos)} hint="não responderam / desistiram" />
            <Stat
              label="Taxa de conversão"
              value={pct(taxaConversao)}
              hint="recuperados / abordados"
              color="text-marca-primario"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">Receita recuperada</h2>
            <p className="text-3xl font-bold text-ganho">{money(a.receita)}</p>
            <p className="text-xs text-slate-400">
              soma das vendas de quem passou por aqui — receita que não existiria sem a fila
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">Por origem</h2>
            <p className="mb-2 text-xs text-slate-400">
              Qual criativo traz lead que só precisa de um empurrão.
            </p>
            {a.porFonte.length === 0 ? (
              <p className="text-sm text-slate-400">Sem dados ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
                    <th className="py-1 text-left font-semibold">Origem</th>
                    <th className="py-1 text-right font-semibold">No CRM</th>
                    <th className="py-1 text-right font-semibold">Recuperados</th>
                  </tr>
                </thead>
                <tbody>
                  {a.porFonte.map((f) => (
                    <tr key={f.source} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 text-marca-azul">{f.source}</td>
                      <td className="py-2 text-right font-semibold text-slate-600">{f.total}</td>
                      <td className="py-2 text-right font-semibold text-ganho">{f.compraram}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
