'use client'

/**
 * Formulaire de création de bloc.
 * Après création, redirige vers le block editor pour que le coach puisse
 * définir la semaine type immédiatement.
 *
 * Templates de bloc :
 * - sélecteur en haut : pré-remplit le form depuis un template enregistré
 * - case à cocher : "Sauver ce bloc comme template" → POST /api/templates/blocks
 *   après création réussie du bloc.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Block } from '@/types/database'
import { Trash2 } from '@/components/ui/Icon'

const BLOCK_TYPES: Block['type'][] = ['Accumulation', 'Intensification', 'Réalisation', 'Deload']

interface BlockTemplate {
  id: string
  name: string
  description: string | null
  type: Block['type']
  total_weeks: number | null
  intensity_zone: string | null
  weeks_to_competition: number | null
  is_taper: boolean
  taper_volume_reduction_pct: number | null
}

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

  // Templates
  const [templates, setTemplates] = useState<BlockTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateDescription, setTemplateDescription] = useState('')

  useEffect(() => {
    fetch('/api/templates/blocks')
      .then(r => r.ok ? r.json() : [])
      .then((data: BlockTemplate[]) => setTemplates(data ?? []))
      .catch(() => {})
  }, [])

  function applyTemplate(id: string) {
    setSelectedTemplateId(id)
    if (!id) return
    const tpl = templates.find(t => t.id === id)
    if (!tpl) return
    setName(tpl.name)
    setType(tpl.type)
    setTotalWeeks(tpl.total_weeks?.toString() ?? '')
    setWeeksToCompetition(tpl.weeks_to_competition?.toString() ?? '')
    setIsTaper(tpl.is_taper)
    setTaperPct(tpl.taper_volume_reduction_pct?.toString() ?? '')
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Supprimer ce template ?')) return
    const res = await fetch(`/api/templates/blocks/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setTemplates(prev => prev.filter(t => t.id !== id))
      if (selectedTemplateId === id) setSelectedTemplateId('')
    }
  }

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

    // Sauver comme template si demandé
    if (saveAsTemplate) {
      await fetch('/api/templates/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: templateDescription || null,
          type,
          total_weeks: totalWeeks ? parseInt(totalWeeks) : null,
          weeks_to_competition: weeksToCompetition ? parseInt(weeksToCompetition) : null,
          is_taper: isTaper,
          taper_volume_reduction_pct: taperPct ? parseFloat(taperPct) : null,
        }),
      })
    }

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

      {/* Sélecteur de template */}
      {templates.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <label className="mb-2 block text-xs uppercase tracking-wider text-zinc-500">
            Charger un template
          </label>
          <div className="flex items-center gap-2">
            <select
              value={selectedTemplateId}
              onChange={e => applyTemplate(e.target.value)}
              className="input-base flex-1"
            >
              <option value="">— Aucun (form vide) —</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.type}{t.total_weeks ? ` · ${t.total_weeks}sem` : ''})
                </option>
              ))}
            </select>
            {selectedTemplateId && (
              <button
                type="button"
                onClick={() => handleDeleteTemplate(selectedTemplateId)}
                className="btn-icon"
                title="Supprimer ce template"
                aria-label="Supprimer ce template"
              >
                <Trash2 className="size-4 text-red-400" />
              </button>
            )}
          </div>
          {selectedTemplateId && (() => {
            const tpl = templates.find(t => t.id === selectedTemplateId)
            return tpl?.description ? (
              <p className="mt-2 text-xs text-zinc-500">{tpl.description}</p>
            ) : null
          })()}
        </div>
      )}

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

        {/* Sauver comme template */}
        <div className="space-y-2 border-t border-zinc-800 pt-3">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={saveAsTemplate}
              onChange={e => setSaveAsTemplate(e.target.checked)}
              className="size-4 rounded border-zinc-600 bg-zinc-900"
            />
            Sauver ce bloc comme template
          </label>
          {saveAsTemplate && (
            <input
              value={templateDescription}
              onChange={e => setTemplateDescription(e.target.value)}
              placeholder="Description (optionnel)"
              className="input-base w-full"
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
