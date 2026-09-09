import Link from 'next/link'
import { getPipeline, FUNIS, FUNIL_PADRAO, TITULO_FUNIL } from '@/lib/data'
import { parseRange } from '@/lib/daterange'
import PipelineBoard from '@/components/PipelineBoard'

// Sempre dados frescos (a fila muda a cada lead novo e a cada venda sincronizada).
export const dynamic = 'force-dynamic'

function um(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const range = parseRange(searchParams)
  const pedido = um(searchParams.funil)
  const funil = FUNIS.some((f) => f.key === pedido) ? (pedido as string) : FUNIL_PADRAO
  const columns = await getPipeline({ start: range.start, end: range.end }, funil)

  // Preserva o filtro de periodo ao trocar de funil: sao dois recortes
  // independentes e perder um ao mexer no outro irrita quem usa todo dia.
  const outros = Object.entries(searchParams)
    .filter(([k]) => k !== 'funil')
    .map(([k, v]) => [k, um(v) ?? ''] as [string, string])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-6 pt-5">
        {FUNIS.map((f) => {
          const qs = new URLSearchParams(outros)
          qs.set('funil', f.key)
          const ativo = f.key === funil
          return (
            <Link
              key={f.key}
              href={`/pipeline?${qs.toString()}`}
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

      {/* min-h-0 é o que deixa o board rolar dentro do flex; sem isso ele
          estoura a altura da tela e a rolagem some. */}
      <div className="min-h-0 flex-1">
        {/* A key força remontagem quando o filtro muda — senão o estado local
            do board segura os cards antigos (pegadinha listada no guia). */}
        <PipelineBoard
          key={`${funil}-${range.label}`}
          columns={columns}
          periodLabel={range.label}
          titulo={TITULO_FUNIL[funil] ?? 'Fila de recuperação'}
        />
      </div>
    </div>
  )
}
