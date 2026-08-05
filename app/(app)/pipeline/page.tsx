import { getPipeline } from '@/lib/data'
import { parseRange } from '@/lib/daterange'
import PipelineBoard from '@/components/PipelineBoard'

// Sempre dados frescos (a fila muda a cada lead novo e a cada venda sincronizada).
export const dynamic = 'force-dynamic'

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const range = parseRange(searchParams)
  const columns = await getPipeline({ start: range.start, end: range.end })

  return (
    // A key força remontagem quando o filtro muda — senão o estado local
    // do board segura os cards antigos (pegadinha listada no guia).
    <PipelineBoard key={range.label} columns={columns} periodLabel={range.label} />
  )
}
