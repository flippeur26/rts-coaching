'use client'

/**
 * Dialog : sauvegarder une séance existante comme session_template.
 * Appelle POST /api/templates/sessions avec { source_session_id, name, description }.
 */

import { useState } from 'react'
import { X } from '@/components/ui/Icon'

interface Props {
  sourceSessionId: string
  defaultName?: string
  onClose: () => void
  onSaved: () => void
}

export default function SaveTemplateDialog({ sourceSessionId, defaultName, onClose, onSaved }: Props) {
  const [name, setName] = useState(defaultName ?? '')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) {
      setError('Le nom est requis')
      return
    }
    setSaving(true)
    setError(null)
    const res = await fetch('/api/templates/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        source_session_id: sourceSessionId,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setError(e?.error ?? 'Erreur lors de la sauvegarde')
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h2 className="text-base font-semibold text-white">Sauver comme template</h2>
          <button onClick={onClose} className="btn-icon" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 p-4 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Nom *</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ex : Séance squat lourd"
              className="input-base w-full"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Description</span>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="ex : Top set + 3×4@8"
              className="input-base min-h-20 w-full resize-y px-3 py-2"
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 p-4">
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  )
}
