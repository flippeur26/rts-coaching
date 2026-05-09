'use client'

/**
 * Dialog : sélectionner un session_template à instancier sur (athlete, date).
 * Appelle GET /api/templates/sessions puis POST /api/templates/sessions/[id]/instantiate.
 */

import { useEffect, useState } from 'react'
import { X, Trash2 } from '@/components/ui/Icon'

interface SessionTemplate {
  id: string
  name: string
  description: string | null
  notes_coach: string | null
  session_template_sets: Array<{ exercise_name: string; set_number: number }>
}

interface Props {
  athleteId: string
  date: string
  onClose: () => void
  onInstantiated: (newSessionId: string) => void
}

export default function TemplatePickerDialog({ athleteId, date, onClose, onInstantiated }: Props) {
  const [templates, setTemplates] = useState<SessionTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/templates/sessions')
      .then(r => r.json())
      .then((data: SessionTemplate[]) => {
        setTemplates(data ?? [])
        setLoading(false)
      })
      .catch(() => {
        setError('Erreur de chargement des templates')
        setLoading(false)
      })
  }, [])

  async function handlePick(tpl: SessionTemplate) {
    setBusyId(tpl.id)
    setError(null)
    const res = await fetch(`/api/templates/sessions/${tpl.id}/instantiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ athlete_id: athleteId, scheduled_date: date }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setError(e?.error ?? 'Erreur lors de l\'instanciation')
      setBusyId(null)
      return
    }
    const created = await res.json()
    onInstantiated(created.id)
  }

  async function handleDelete(tpl: SessionTemplate) {
    if (!confirm(`Supprimer le template "${tpl.name}" ?`)) return
    const res = await fetch(`/api/templates/sessions/${tpl.id}`, { method: 'DELETE' })
    if (res.ok) setTemplates(prev => prev.filter(t => t.id !== tpl.id))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <div>
            <h2 className="text-base font-semibold text-white">Charger un template</h2>
            <p className="text-xs text-zinc-500">Sera instancié le {date}</p>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-zinc-500">Chargement…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Aucun template pour le moment. Sauvegardes-en une depuis une séance existante.
            </p>
          ) : (
            <ul className="space-y-2">
              {templates.map(tpl => (
                <li
                  key={tpl.id}
                  className="group flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"
                >
                  <button
                    onClick={() => handlePick(tpl)}
                    disabled={busyId === tpl.id}
                    className="flex-1 text-left disabled:opacity-50"
                  >
                    <div className="font-medium text-white">{tpl.name}</div>
                    {tpl.description && (
                      <div className="mt-0.5 text-xs text-zinc-500">{tpl.description}</div>
                    )}
                    <div className="mt-1 text-[11px] text-zinc-600">
                      {tpl.session_template_sets?.length ?? 0} set(s)
                    </div>
                  </button>
                  <button
                    onClick={() => handleDelete(tpl)}
                    className="btn-icon opacity-0 group-hover:opacity-100"
                    aria-label="Supprimer"
                    title="Supprimer le template"
                  >
                    <Trash2 className="size-4 text-red-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end border-t border-zinc-800 p-4">
          <button onClick={onClose} className="btn-secondary">Fermer</button>
        </div>
      </div>
    </div>
  )
}
