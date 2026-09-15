import Link from 'next/link'
import { getAnalytics, ABORDAGEM, FUNIS, FUNIL_PADRAO } from '@/lib/data'
import { parseRange } from '@/lib/daterange'
import { money } from '@/lib/format'
import DateFilter from '@/components/DateFilter'

export const dynamic = 'force-dynamic'

function um(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

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

/** Tabela de dois numeros por linha (no CRM x compraram), usada por origem e por publico. */
function TabelaGrupo({
  titulo,
  hint,
  coluna,
  ganho,
  linhas,
}: {
  titulo: string
  hint: string
  coluna: string
  ganho: string
  linhas: { nome: string; total: number; compraram: number }[]
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">{titulo}</h2>
      <p className="mb-2 text-xs text-slate-400">{hint}</p>
      {linhas.length === 0 ? (
        <p className="text-sm text-slate-400">Sem dados ainda.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
              <th className="py-1 text-left font-semibold">{coluna}</th>
              <th className="py-1 text-right font-semibold">No CRM</th>
              <th className="py-1 text-right font-semibold">{ganho}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.nome} className="border-b border-slate-100 last:border-0">
                <td className="py-2 text-marca-azul">{l.nome}</td>
                <td className="py-2 text-right font-semibold text-slate-600">{l.total}</td>
                <td className="py-2 text-right font-semibold text-ganho">{l.compraram}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/**
 * Textos de tela por funil. Os numeros sao os mesmos nos dois; o que muda e o
 * que eles significam: no abandono a venda e o ingresso recuperado, na lista
 * de espera e a compra do Metodo Azul.
 */
const TEXTO: Record<
  string,
  {
    subtitulo: string
    tituloFunil: string
    noCrm: string
    ganho: string
    ganhoHint: string
    receitaTitulo: string
    receitaHint: string
    origemHint: string
  }
> = {
  abandono: {
    subtitulo: 'Recuperação do ingresso',
    tituloFunil: 'Funil de recuperação',
    noCrm: 'preencheram e não compraram na hora',
    ganho: 'Recuperados',
    ganhoHint: 'compraram depois do contato',
    receitaTitulo: 'Receita recuperada',
    receitaHint: 'soma das vendas de quem passou pela fila, receita que não existiria sem ela',
    origemHint: 'Qual criativo traz lead que só precisa de um empurrão.',
  },
  'lista-espera': {
    subtitulo: 'Lista de espera do Método Azul',
    tituloFunil: 'Funil da lista de espera',
    noCrm: 'se inscreveram na lista',
    ganho: 'Compraram',
    ganhoHint: 'compraram o Método Azul',
    receitaTitulo: 'Receita de Método Azul',
    receitaHint: 'soma das compras do Método Azul feitas depois da inscrição na lista',
    origemHint: 'De onde vêm os inscritos e quantos viram venda.',
  },
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const range = parseRange(searchParams)
  const filter = { start: range.start, end: range.end }
  const pedido = um(searchParams.funil)
  const funil = FUNIS.some((f) => f.key === pedido) ? (pedido as string) : FUNIL_PADRAO
  const t = TEXTO[funil] ?? TEXTO.abandono

  const a = await getAnalytics(filter, funil)
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`

  // Preserva o filtro de periodo ao trocar de funil (mesma regra do Pipeline).
  const outros = Object.entries(searchParams)
    .filter(([k]) => k !== 'funil')
    .map(([k, v]) => [k, um(v) ?? ''] as [string, string])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-marca-azul">Analytics</h1>
        <p className="text-sm text-slate-500">
          {t.subtitulo} · por data de entrada · {range.label}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {FUNIS.map((f) => {
            const qs = new URLSearchParams(outros)
            qs.set('funil', f.key)
            const ativo = f.key === funil
            return (
              <Link
                key={f.key}
                href={`/analytics?${qs.toString()}`}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                  ativo
                    ? 'bg-marca-primario text-white'
                    : 'bg-white text-marca-azul ring-1 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </Link>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <DateFilter />
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase text-slate-500">{t.tituloFunil}</h2>
          <p className="mb-3 text-xs text-slate-400">
            As taxas usam como base <b>quem já foi abordado</b>. Quem está parado na fila ainda não
            foi trabalhado e não entra na conta.
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Stat label="No CRM" value={String(a.totalContatos)} hint={t.noCrm} />
            <Stat label="Na fila" value={String(a.naFila)} hint="ainda não abordados" />
            <Stat label="Abordados" value={String(a.abordados)} hint="base das taxas" />
            <Stat
              label={t.ganho}
              value={String(a.compraram)}
              hint={t.ganhoHint}
              color="text-ganho"
            />
            <Stat label="Perdidos" value={String(a.perdidos)} hint="não responderam / desistiram" />
            <Stat
              label="Taxa de conversão"
              value={pct(a.taxaConversao)}
              hint={`${t.ganho.toLowerCase()} / abordados`}
              color="text-marca-primario"
            />
          </div>
        </div>

        {/* O comparativo v1 x v3 e o teste A/B do T15: so existe no abandono. */}
        {funil === 'abandono' && (
          <div>
            <h2 className="mb-2 text-sm font-bold uppercase text-slate-500">
              Comparativo de abordagem
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              Cada página manda os leads para uma abordagem diferente no WhatsApp. A base é{' '}
              <b>quem entrou na fila</b>: quem comprou sozinho nunca chega aqui, então não infla a
              conta de nenhum dos dois lados.
            </p>
            {a.porEvento.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-400">
                Sem dados ainda.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {a.porEvento.map((e) => (
                  <div key={e.evento} className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-sm font-bold text-marca-azul">
                      {ABORDAGEM[e.evento] || e.evento}
                    </p>
                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <p className="text-3xl font-bold text-marca-primario">{pct(e.taxa)}</p>
                        <p className="text-xs text-slate-400">recuperados / na fila</p>
                      </div>
                      <div className="text-right text-sm text-slate-500">
                        <p>
                          <b className="text-marca-azul">{e.total}</b> na fila
                        </p>
                        <p>
                          <b className="text-ganho">{e.compraram}</b> recuperados
                        </p>
                        <p className="text-xs">{money(e.receita)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {a.porEvento.length >= 2 && (
              <p className="mt-3 text-xs text-slate-400">
                ⚠️ As páginas também são diferentes entre si. Se uma converter melhor, pode ser a
                abordagem <i>ou</i> o perfil de quem cada página atrai. Para isolar a abordagem, as
                duas precisam receber tráfego parecido.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">{t.receitaTitulo}</h2>
            <p className="text-3xl font-bold text-ganho">{money(a.receita)}</p>
            <p className="text-xs text-slate-400">{t.receitaHint}</p>
          </div>

          <TabelaGrupo
            titulo="Por público"
            hint="Público quente contra público frio, lido da campanha do anúncio."
            coluna="Público"
            ganho={t.ganho}
            linhas={a.porPublico.map((p) => ({ nome: p.publico, total: p.total, compraram: p.compraram }))}
          />

          <TabelaGrupo
            titulo="Por origem"
            hint={t.origemHint}
            coluna="Origem"
            ganho={t.ganho}
            linhas={a.porFonte.map((f) => ({ nome: f.source, total: f.total, compraram: f.compraram }))}
          />
        </div>
      </div>
    </div>
  )
}
