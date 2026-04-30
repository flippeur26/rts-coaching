'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import type { Block } from '@/types/database'

interface Props {
  blocks: Block[]
  athleteId: string
  coachId: string
}

const TYPE_COLORS: Record<string, string> = {
  Accumulation: 'bg-blue-900 text-blue-300',
  Intensification: 'bg-purple-900 text-purple-300',
  Réalisation: 'bg-orange-900 text-orange-300',
  Deload: 'bg-gray-700 text-gray-300',
}

export default function GestionBlocs({ blocks, athleteId }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    type: 'Accumulation' as Block['type'],
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    total_weeks: '4',
    intensity_zone: '',
    weeks_to_competition: '',
    is_taper: false,
    taper_volume_reduction_pct: '',
  })
  const router = useRouter()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        athlete_id: athleteId,
        name: form.name,
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date || null,
        total_weeks: form.total_weeks ? parseInt(form.total_weeks) : null,
        intensity_zone: form.intensity_zone || null,
        weeks_to_competition: form.weeks_to_competition ? parseInt(form.weeks_to_competition) : null,
        is_taper: form.is_taper,
        taper_volume_reduction_pct: form.taper_volume_reduction_pct ? parseFloat(form.taper_volume_reduction_pct) : null,
      }),
    })
    setSaving(false)
    setShowForm(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce bloc ? Les séances liées seront déliées.')) return
    await fetch(`/api/blocks/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Blocs / Mésocycles</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-orange-500 hover:text-orange-400 text-sm transition-colors"
        >
          {showForm ? 'Annuler' : '+ Nouveau bloc'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-5 p-4 bg-gray-800 rounded-xl space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nom du bloc</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="ex: Accum. Hiver 2025"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as Block['type'] }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {['Accumulation', 'Intensification', 'Réalisation', 'Deload'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Date début</label>
              <input
                type="date"
                required
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Semaines totales</label>
              <input
                type="number"
                value={form.total_weeks}
                onChange={e => setForm(f => ({ ...f, total_weeks: e.target.value }))}
                min={1} max={20}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Zone d&apos;intensité</label>
              <input
                value={form.intensity_zone}
                onChange={e => setForm(f => ({ ...f, intensity_zone: e.target.value }))}
                placeholder="ex: RPE 7.5–8.5"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Semaines avant compétition</label>
              <input
                type="number"
                value={form.weeks_to_competition}
                onChange={e => setForm(f => ({ ...f, weeks_to_competition: e.target.value }))}
                min={0}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_taper}
                onChange={e => setForm(f => ({ ...f, is_taper: e.target.checked }))}
                className="rounded"
              />
              Phase taper
            </label>
            {form.is_taper && (
              <input
                type="number"
                value={form.taper_volume_reduction_pct}
                onChange={e => setForm(f => ({ ...f, taper_volume_reduction_pct: e.target.value }))}
                placeholder="% réduction volume"
                min={0} max={100}
                className="w-44 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
          >
            {saving ? 'Création...' : 'Créer le bloc'}
          </button>
        </form>
      )}

      {blocks.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucun bloc créé.</p>
      ) : (
        <div className="space-y-2">
          {blocks.map(b => (
            <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{b.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TYPE_COLORS[b.type]}`}>
                    {b.type}
                  </span>
                  {b.is_taper && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-900 text-yellow-300 font-medium">Taper</span>
                  )}
                </div>
                <p className="text-gray-500 text-xs mt-0.5">
                  {format(parseISO(b.start_date), 'd MMM yyyy', { locale: fr })}
                  {b.total_weeks ? ` · ${b.total_weeks} sem.` : ''}
                  {b.intensity_zone ? ` · ${b.intensity_zone}` : ''}
                  {b.weeks_to_competition != null ? ` · J-${b.weeks_to_competition * 7}` : ''}
                </p>
              </div>
              <button
                onClick={() => handleDelete(b.id)}
                className="text-gray-600 hover:text-red-500 text-sm transition-colors ml-4"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
