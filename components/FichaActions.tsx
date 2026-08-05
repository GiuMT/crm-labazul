'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type StageOpt = { id: string; name: string }

export default function FichaActions({
  contactId,
  dealId,
  currentStageId,
  stages,
}: {
  contactId: string
  dealId: string | null
  currentStageId: string | null
  stages: StageOpt[]
}) {
  const router = useRouter()
  const [stageId, setStageId] = useState(currentStageId || '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function moveStage(newStage: string) {
    if (!dealId || newStage === currentStageId) return
    setStageId(newStage)
    setBusy(true)
    await fetch('/api/deals/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealId, stageId: newStage }),
    })
    setBusy(false)
    router.refresh()
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setBusy(true)
    await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId, type: 'nota', text: note.trim() }),
    })
    setNote('')
    setBusy(false)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {dealId && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
            Mover para
          </label>
          <select
            value={stageId}
            disabled={busy}
            onChange={(e) => moveStage(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-marca-primario"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <form onSubmit={addNote}>
        <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
          Adicionar nota
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Registrar contato, tentativa de recuperacao..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-marca-primario"
        />
        <button
          disabled={busy || !note.trim()}
          className="mt-2 w-full rounded-lg bg-marca-primario py-2 text-sm font-semibold text-white hover:bg-marca-primario-600 disabled:opacity-60"
        >
          Salvar nota
        </button>
      </form>
    </div>
  )
}
