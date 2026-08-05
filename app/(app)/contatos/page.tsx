import Link from 'next/link'
import { getContacts } from '@/lib/data'
import { dateShort, relativeDay, money, waLink } from '@/lib/format'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'todos', label: 'Todos' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'leads', label: 'Leads' },
]

export default async function ContatosPage({
  searchParams,
}: {
  searchParams: { tab?: string; q?: string }
}) {
  const tab = searchParams.tab || 'todos'
  const q = searchParams.q || ''
  const rows = await getContacts({ tab, q })

  return (
    <div className="flex h-full flex-col">
      {/* Topbar */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-marca-azul">Contatos</h1>
          <p className="text-sm text-slate-500">{rows.length} registros</p>
        </div>
        <form action="/contatos" method="get" className="flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Nome, e-mail ou WhatsApp..."
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-marca-primario"
          />
          <button className="rounded-lg bg-marca-primario px-4 py-2 text-sm font-semibold text-white hover:bg-marca-primario-600">
            Buscar
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Abas */}
        <div className="mb-4 flex gap-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/contatos?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                tab === t.key
                  ? 'bg-marca-primario text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {/* Tabela */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Contato</th>
                <th className="px-4 py-3 font-semibold">E-mail / WhatsApp</th>
                <th className="px-4 py-3 font-semibold">Origem</th>
                <th className="px-4 py-3 font-semibold">Entrada</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">LTV</th>
                <th className="px-4 py-3 font-semibold">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const wa = waLink(c.phone)
                return (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/contatos/${c.id}`}
                        className="font-semibold text-marca-azul hover:text-marca-primario-600"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-600">{c.email}</div>
                      {c.phone && (
                        <div>
                          {wa ? (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-ganho hover:underline"
                            >
                              💬 {c.phone}
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">{c.phone}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {c.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{dateShort(c.firstSeenAt)}</td>
                    <td className="px-4 py-3">
                      {c.isCliente ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-ganho">
                          Cliente
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                          Lead
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-marca-azul">
                      {c.ltv > 0 ? money(c.ltv) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{relativeDay(c.updatedAt)}</td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Nenhum contato ainda. Eles vao aparecer aqui conforme os formularios e vendas chegam.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
