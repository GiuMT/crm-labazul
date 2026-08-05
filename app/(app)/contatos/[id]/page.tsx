import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getContact, getStages } from '@/lib/data'
import { dateShort, money, waLink } from '@/lib/format'
import FichaActions from '@/components/FichaActions'

export const dynamic = 'force-dynamic'

const TIPO_LABEL: Record<string, string> = {
  nota: 'Nota',
  tarefa: 'Tarefa',
  evento: 'Evento',
  sistema: 'Sistema',
  conversao: 'Conversao',
  compra: 'Compra',
}

export default async function FichaPage({ params }: { params: { id: string } }) {
  const [contact, stages] = await Promise.all([getContact(params.id), getStages()])
  if (!contact) notFound()

  const deal = contact.deals[0] || null
  const wa = waLink(contact.phone)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <Link href="/contatos" className="text-sm text-slate-500 hover:text-marca-primario-600">
          ← Contatos
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-bold text-marca-azul">{contact.name || contact.email}</h1>
          {contact.isCliente ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-ganho">
              Cliente
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
              Lead
            </span>
          )}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-3">
        {/* Coluna esquerda: dados + timeline */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">Dados</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-400">E-mail</dt>
                <dd className="text-marca-azul">{contact.email}</dd>
              </div>
              <div>
                <dt className="text-slate-400">WhatsApp</dt>
                <dd>
                  {wa ? (
                    <a href={wa} target="_blank" rel="noreferrer" className="text-ganho hover:underline">
                      💬 {contact.phone}
                    </a>
                  ) : (
                    <span className="text-slate-500">{contact.phone || '—'}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Origem</dt>
                <dd className="text-marca-azul">{contact.source || 'Direto'}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Lançamento</dt>
                <dd className="text-marca-azul">{contact.evento || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Rastreio (src)</dt>
                <dd>
                  {contact.src ? (
                    <span className="inline-block rounded bg-marca-primario-100 px-2 py-0.5 text-xs font-semibold text-marca-primario-600">
                      {contact.src}
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Campanha (sck)</dt>
                <dd className="text-marca-azul">{contact.sck || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Entrada</dt>
                <dd className="text-marca-azul">{dateShort(contact.firstSeenAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">LTV</dt>
                <dd className="font-semibold text-marca-azul">
                  {Number(contact.ltv) > 0 ? money(Number(contact.ltv)) : '—'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">Timeline</h2>
            <ul className="space-y-3">
              {contact.activities.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className="mt-0.5 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                    {TIPO_LABEL[a.type] || a.type}
                  </span>
                  <div>
                    <p className="text-marca-azul">{a.text}</p>
                    <p className="text-xs text-slate-400">{dateShort(a.createdAt)}</p>
                  </div>
                </li>
              ))}
              {contact.activities.length === 0 && (
                <li className="text-sm text-slate-400">Sem atividades ainda.</li>
              )}
            </ul>
          </div>
        </div>

        {/* Coluna direita: acoes */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">Acoes</h2>
          <FichaActions
            contactId={contact.id}
            dealId={deal?.id || null}
            currentStageId={deal?.stageId || null}
            stages={stages.map((s) => ({ id: s.id, name: s.name }))}
          />
        </div>
      </div>
    </div>
  )
}
