'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

const PRESETS: { key: string; label: string }[] = [
  { key: 'tudo', label: 'Tudo' },
  { key: 'hoje', label: 'Hoje' },
  { key: 'ontem', label: 'Ontem' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'este-mes', label: 'Este mês' },
  { key: 'mes-passado', label: 'Mês passado' },
]

export default function DateFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const de = sp.get('de') ?? ''
  const ate = sp.get('ate') ?? ''
  const isCustom = !!(de && ate)
  const active = isCustom ? 'custom' : sp.get('range') ?? 'tudo'

  const [open, setOpen] = useState(false)
  const [dDe, setDDe] = useState(de)
  const [dAte, setDAte] = useState(ate)

  // Preserva o funil selecionado ao trocar o período.
  function baseParams() {
    const p = new URLSearchParams()
    const funil = sp.get('funil')
    if (funil) p.set('funil', funil)
    return p
  }

  function goPreset(key: string) {
    const p = baseParams()
    if (key !== 'tudo') p.set('range', key)
    const qs = p.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
    setOpen(false)
  }

  function goCustom() {
    if (!dDe || !dAte) return
    const p = baseParams()
    p.set('de', dDe)
    p.set('ate', dAte)
    router.push(`${pathname}?${p.toString()}`)
    setOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => goPreset(p.key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            active === p.key
              ? 'bg-marca-primario text-white'
              : 'border border-slate-200 bg-white text-slate-600 hover:border-marca-primario hover:text-marca-primario-600'
          }`}
        >
          {p.label}
        </button>
      ))}

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            active === 'custom'
              ? 'bg-marca-primario text-white'
              : 'border border-slate-200 bg-white text-slate-600 hover:border-marca-primario hover:text-marca-primario-600'
          }`}
        >
          {active === 'custom' ? `${de} a ${ate}` : 'Período…'}
        </button>

        {open && (
          <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <label className="block text-[11px] font-semibold uppercase text-slate-500">De</label>
            <input
              type="date"
              value={dDe}
              onChange={(e) => setDDe(e.target.value)}
              className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
            <label className="block text-[11px] font-semibold uppercase text-slate-500">Até</label>
            <input
              type="date"
              value={dAte}
              onChange={(e) => setDAte(e.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
            <button
              onClick={goCustom}
              disabled={!dDe || !dAte}
              className="w-full rounded-lg bg-marca-primario px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-marca-primario-600 disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
