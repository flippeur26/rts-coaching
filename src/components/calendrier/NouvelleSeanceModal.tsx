'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Props {
  date: string
  athleteId: string
  coachId: string
  onClose: () => void
  onCreate: () => void
}

export default function NouvelleSeanceModal({ date, athleteId, onClose, onCreate }: Props) {
  const [notesCoach, setNotesCoach] = useState('')
  const [weekInBlock, setWeekInBlock] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setLoading(true)
    setError(null)

    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        athlete_id: athleteId,
        scheduled_date: date,
        notes_coach: notesCoach || null,
        week_in_block: weekInBlock ? parseInt(weekInBlock) : null,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Erreur lors de la création')
      setLoading(false)
      return
    }

    onCreate()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-white">Nouvelle séance</h2>
            <p className="text-gray-400 text-sm mt-0.5">
              {format(parseISO(date), 'EEEE d MMMM yyyy', { locale: fr })}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Notes pour l&apos;athlète
            </label>
            <input
              type="text"
              value={notesCoach}
              onChange={e => setNotesCoach(e.target.value)}
              placeholder="ex: Jour lourd squat"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Semaine dans le bloc
            </label>
            <input
              type="number"
              value={weekInBlock}
              onChange={e => setWeekInBlock(e.target.value)}
              placeholder="ex: 1"
              min={1}
              max={20}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="flex gap-3 p-5 border-t border-gray-800">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
          >
            {loading ? 'Création...' : 'Créer la séance'}
          </button>
        </div>
      </div>
    </div>
  )
}
