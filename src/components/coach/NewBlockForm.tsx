'use client'

/**
 * Formulaire de création de bloc.
 * Après création, redirige vers le block editor pour que le coach puisse
 * définir la semaine type immédiatement.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Block } from '@/types/database'

const BLOCK_TYPES: Block['type'][] = ['Accumulation', 'Intensification', 'Réalisation', 'Deload']

export default function NewBlockForm({ athleteId }: { athleteId: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [type, setType] = useState<Block['type']>('Accumulation')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [totalWeeks, setTotalWeeks] = useState('4')
  const [weeksToCompetition, setWeeksToCompetition] = useState('')
  const [isTaper, setIsTaper] = useState(false)
  const [taperPct, setTaperPct] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const res = await fetch('/api/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        athlete_id: athleteId,
        name,
        type,
        start_date: startDate,
        total_weeks: totalWeeks ? parseInt(totalWeeks) : null,
        weeks_to_competition: weeksToCompetition ? parseInt(weeksToCompetition) : null,
        is_taper: isTaper,
        taper_volume_reduction_pct: taperPct ? parseFloat(taperPct) : null,
      }),
    })

    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setError(e?.error ?? 'Erreur de création')
      setSaving(false)
      return
    }
    const created: Block = await res.json()
    router.push(`/coach/athletes/${athleteId}/blocs/${created.id}`)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Nouveau bloc</h1>
        <p className="text-sm text-zinc-500">
          Une fois créé, tu pourras définir la semaine type puis générer les semaines suivantes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nom du bloc *">
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ex : Accumulation hiver 2026"
              className="input-base"
            />
          </Field>
          <Field label="Type">
            <select value={type} onChange={e => setType(e.target.value as Block['type'])} className="input-base">
              {BLOCK_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Date de début *">
            <input
              type="date"
              required
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="input-base"
            />
          </Field>
          <Field label="Semaines totales">
            <input
              type="number" min={1} max={20}
              value={totalWeeks}
              onChange={e => setTotalWeeks(e.target.value)}
              className="input-base"
            />
          </Field>
          <Field label="Semaines avant compétition">
            <input
              type="number" min={0} max={52}
              value={weeksToCompetition}
              onChange={e => setWeeksToCompetition(e.target.value)}
              placeholder="ex : 8"
              className="input-base"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-3">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={isTaper}
              onChange={e => setIsTaper(e.target.checked)}
              className="size-4 rounded border-zinc-600 bg-zinc-900"
            />
            Phase taper
          </label>
          {isTaper && (
            <input
              type="number" min={0} max={100}
              value={taperPct}
              onChange={e => setTaperPct(e.target.value)}
              placeholder="% réduction de volume"
              className="input-base w-48"
            />
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
          >
            Annuler
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Création…' : 'Créer le bloc'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </label>
  )
}
