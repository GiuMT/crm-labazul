'use client'

import { useState } from 'react'
import Link from 'next/link'
import { dateShort, money, paginaDoEvento } from '@/lib/format'
import type { Column, Card } from '@/lib/data'
import DateFilter from './DateFilter'

/**
 * Kanban da fila de recuperação.
 *
 * Diferente do CRM do Abel, aqui não há seletor de funil (a LabAzul tem um só),
 * status de WhatsApp (não há integração por API) nem lead score (produto único,
 * o score não separa ninguém). O que sobrou é o que a equipe usa: quem contatar,
 * há quanto tempo está esperando e o botão pra abrir a conversa.
 */

/** Etiqueta de espera. Passa a alertar quando o lead esfria. */
function TempoNaFila({ dias }: { dias: number }) {
  if (dias <= 0) {
    return (
      <span className="rounded-full bg-marca-ciano-100 px-2 py-0.5 text-[11px] font-semibold text-marca-azul">
        hoje
      </span>
    )
  }
  const cor =
    dias >= 7
      ? 'bg-red-100 text-red-700'
      : dias >= 3
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-500'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cor}`}>
      {dias}d esperando
    </span>
  )
}

function BotaoWhatsApp({ card }: { card: Card }) {
  if (!card.whatsappLink) return null
  const texto = encodeURIComponent(
    `Olá, ${(card.name || '').split(' ')[0]}! Aqui é da equipe do LabAzul.`
  )
  return (
    <a
      href={`${card.whatsappLink}?text=${texto}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-1.5 text-[12px] font-semibold text-white transition hover:bg-emerald-700"
    >
      Abrir WhatsApp
    </a>
  )
}

export default function PipelineBoard({
  columns,
  periodLabel,
}: {
  columns: Column[]
  periodLabel: string
}) {
  const [cols, setCols] = useState(columns)
  const [dragging, setDragging] = useState<{ dealId: string; from: string } | null>(null)

  async function moveCard(dealId: string, from: string, to: string) {
    if (from === to) return
    // otimista: move localmente
    setCols((prev) => {
      const next = prev.map((c) => ({ ...c, cards: [...c.cards] }))
      const fromCol = next.find((c) => c.id === from)
      const toCol = next.find((c) => c.id === to)
      if (!fromCol || !toCol) return prev
      const idx = fromCol.cards.findIndex((k) => k.dealId === dealId)
      if (idx === -1) return prev
      const [card] = fromCol.cards.splice(idx, 1)
      toCol.cards.unshift(card)
      fromCol.count--
      toCol.count++
      fromCol.total -= card.value
      toCol.total += card.value
      return next
    })
    try {
      await fetch('/api/deals/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, stageId: to }),
      })
    } catch {
      window.location.reload()
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Topbar */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-marca-azul">Fila de recuperação</h1>
            <p className="text-sm text-slate-500">
              Quem preencheu o formulário e não comprou · {periodLabel}
            </p>
          </div>
          <Link
            href="/contatos"
            className="shrink-0 rounded-lg border border-marca-primario px-4 py-2 text-sm font-semibold text-marca-primario hover:bg-marca-primario-100"
          >
            Ver contatos
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <DateFilter />
        </div>
      </div>

      {/* Colunas */}
      <div className="flex flex-1 gap-4 overflow-x-auto p-6">
        {cols.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging) moveCard(dragging.dealId, dragging.from, col.id)
              setDragging(null)
            }}
            className="flex w-72 flex-shrink-0 flex-col rounded-xl bg-slate-50"
          >
            <div className="rounded-t-xl border-t-4 px-4 py-3" style={{ borderColor: col.color }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-wide text-marca-azul">
                  {col.name}
                </span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {col.count}
                </span>
              </div>
              {col.total > 0 && <span className="text-xs text-slate-500">{money(col.total)}</span>}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {col.cards.map((card) => (
                <div
                  key={card.dealId}
                  draggable
                  onDragStart={() => setDragging({ dealId: card.dealId, from: col.id })}
                  className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow active:cursor-grabbing"
                >
                  <Link href={`/contatos/${card.contactId}`} className="block">
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-marca-azul">{card.name}</span>
                      <TempoNaFila dias={card.diasNaFila} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {paginaDoEvento(card.evento) && (
                        <span className="inline-block rounded bg-marca-azul px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-marca-ciano">
                          {paginaDoEvento(card.evento)}
                        </span>
                      )}
                      <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                        {card.source}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>Entrada: {dateShort(card.firstSeenAt)}</span>
                      {card.value > 0 && (
                        <span className="font-semibold text-marca-azul">{money(card.value)}</span>
                      )}
                    </div>
                  </Link>
                  {!col.isWon && !col.isLost && <BotaoWhatsApp card={card} />}
                </div>
              ))}
              {col.cards.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-slate-400">Vazio</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
