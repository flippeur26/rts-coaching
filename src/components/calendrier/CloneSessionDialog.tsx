'use client'

/**
 * Dialog : cloner une séance sur une nouvelle date (même athlète).
 */

import { useState } from 'react'
import { X } from '@/components/ui/Icon'

interface Props {
  sessionId: string
  defaultDate: string
  onClose: () => void
  onCloned: () => void
}

export default function CloneSessionDialog({ sessionId, defaultDate, onClose, onCloned }: Props) {
  const [date, setDate] = useState(defaultDate)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClone() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/sessions/${sessionId}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_date: date }),
    })
    setSaving(false)
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setError(e?.error ?? 'Erreur lors du clonage')
      return
    }
    onCloned()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h2 className="text-base font-semibold text-white">Cloner cette séance</h2>
          <button onClick={onClose} className="btn-icon" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 p-4 text-sm">
          <p className="text-xs text-zinc-500">
            La prescription sera dupliquée sur la nouvelle date. Le réalisé n&apos;est pas copié.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Nouvelle date</span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="input-base w-full"
              autoFocus
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 p-4">
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button onClick={handleClone} disabled={saving} className="btn-primary">
            {saving ? 'Clonage…' : 'Cloner'}
          </button>
        </div>
      </div>
    </div>
  )
}
