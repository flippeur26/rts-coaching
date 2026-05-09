'use client'

/**
 * AthleteMedicalSection — antécédents + blessures (actives/résolues).
 * Utilisé dans la page /parametres (athlète + coach).
 */

import { useEffect, useState } from 'react'
import type { AthleteInjury, AthleteMedicalHistory, BodyZone } from '@/types/database'
import { BODY_ZONES } from '@/types/database'
import { Plus, Trash2, Check, X } from '@/components/ui/Icon'

interface Props {
  athleteId: string
}

export default function AthleteMedicalSection({ athleteId }: Props) {
  const [history, setHistory] = useState<AthleteMedicalHistory | null>(null)
  const [injuries, setInjuries] = useState<AthleteInjury[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form pour nouvelle blessure
  const [newOpen, setNewOpen] = useState(false)
  const [newZone, setNewZone] = useState<BodyZone>('Lombaires')
  const [newDescription, setNewDescription] = useState('')
  const [newSeverity, setNewSeverity] = useState<number>(2)
  const [newStartedOn, setNewStartedOn] = useState(() => new Date().toISOString().slice(0, 10))

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/athletes/${athleteId}/medical-history`).then(r => r.ok ? r.json() : null),
      fetch(`/api/athletes/${athleteId}/injuries`).then(r => r.ok ? r.json() : []),
    ]).then(([h, i]: [AthleteMedicalHistory | null, AthleteInjury[]]) => {
      setHistory(h)
      setInjuries(i ?? [])
      setLoading(false)
    }).catch(() => {
      setError('Erreur de chargement')
      setLoading(false)
    })
  }, [athleteId])

  async function saveHistory(updates: Partial<AthleteMedicalHistory>) {
    if (!history) return
    const next = { ...history, ...updates }
    setHistory(next)
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/athletes/${athleteId}/medical-history`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    setSaving(false)
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setError(e?.error ?? 'Erreur de sauvegarde')
    }
  }

  async function addInjury() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/athletes/${athleteId}/injuries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body_zone: newZone,
        description: newDescription || null,
        severity: newSeverity,
        started_on: newStartedOn || null,
        status: 'active',
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setError(e?.error ?? 'Erreur')
      return
    }
    const created: AthleteInjury = await res.json()
    setInjuries(prev => [created, ...prev])
    setNewOpen(false)
    setNewDescription('')
    setNewSeverity(2)
  }

  async function patchInjury(injuryId: string, updates: Partial<AthleteInjury>) {
    const res = await fetch(`/api/athletes/${athleteId}/injuries/${injuryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setError(e?.error ?? 'Erreur')
      return
    }
    const updated: AthleteInjury = await res.json()
    setInjuries(prev => prev.map(i => i.id === injuryId ? updated : i))
  }

  async function deleteInjury(injuryId: string) {
    if (!confirm('Supprimer cette blessure ?')) return
    const res = await fetch(`/api/athletes/${athleteId}/injuries/${injuryId}`, { method: 'DELETE' })
    if (res.ok) setInjuries(prev => prev.filter(i => i.id !== injuryId))
  }

  if (loading) return <p className="text-sm text-zinc-500">Chargement…</p>

  const active = injuries.filter(i => i.status === 'active')
  const resolved = injuries.filter(i => i.status === 'resolved')

  return (
    <div className="space-y-6">
      {/* Antécédents */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="mb-3 text-base font-semibold text-white">Antécédents médicaux</h2>
        <p className="mb-2 text-xs text-zinc-500">
          Pathologies, opérations, conditions chroniques pertinentes pour l&apos;entraînement.
        </p>
        <textarea
          rows={4}
          value={history?.general_history ?? ''}
          onChange={e => setHistory(h => h ? { ...h, general_history: e.target.value } : h)}
          onBlur={e => saveHistory({ general_history: e.target.value || null })}
          placeholder="ex : hernie discale L4-L5 (2022), opération coiffe des rotateurs droite (2020)…"
          className="input-base min-h-24 w-full resize-y px-3 py-2"
        />

        <h3 className="mt-4 mb-2 text-sm font-medium text-zinc-300">Notes additionnelles</h3>
        <textarea
          rows={3}
          value={history?.notes ?? ''}
          onChange={e => setHistory(h => h ? { ...h, notes: e.target.value } : h)}
          onBlur={e => saveHistory({ notes: e.target.value || null })}
          placeholder="Allergies, médicaments en cours, contraintes alimentaires…"
          className="input-base min-h-20 w-full resize-y px-3 py-2"
        />
      </section>

      {/* Blessures actives */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            Blessures actuelles <span className="text-zinc-500 font-normal">({active.length})</span>
          </h2>
          <button onClick={() => setNewOpen(true)} className="btn-secondary">
            <Plus className="size-4" />
            Ajouter
          </button>
        </div>

        {newOpen && (
          <div className="mb-4 space-y-3 rounded-lg border border-orange-700/50 bg-orange-950/20 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Zone du corps</span>
                <select value={newZone} onChange={e => setNewZone(e.target.value as BodyZone)} className="input-base w-full">
                  {BODY_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Date de début</span>
                <input type="date" value={newStartedOn} onChange={e => setNewStartedOn(e.target.value)} className="input-base w-full" />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Description</span>
              <textarea
                rows={2}
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="ex : tendinopathie au coude droit, douleur sur extension"
                className="input-base min-h-16 w-full resize-y px-3 py-2"
              />
            </label>
            <div>
              <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
                Sévérité (1 = gêne légère, 5 = blocage total)
              </span>
              <div className="flex gap-1">
                {[1,2,3,4,5].map(v => (
                  <button
                    key={v}
                    onClick={() => setNewSeverity(v)}
                    className={`h-9 w-9 rounded-md text-sm font-semibold transition-colors ${
                      newSeverity === v ? 'bg-orange-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >{v}</button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setNewOpen(false)} className="btn-secondary">Annuler</button>
              <button onClick={addInjury} disabled={saving} className="btn-primary">
                {saving ? 'Ajout…' : 'Ajouter la blessure'}
              </button>
            </div>
          </div>
        )}

        {active.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucune blessure active.</p>
        ) : (
          <ul className="space-y-2">
            {active.map(inj => (
              <InjuryRow
                key={inj.id}
                injury={inj}
                onPatch={updates => patchInjury(inj.id, updates)}
                onDelete={() => deleteInjury(inj.id)}
                onResolve={() => patchInjury(inj.id, { status: 'resolved' })}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Blessures passées */}
      {resolved.length > 0 && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="mb-3 text-base font-semibold text-white">
            Blessures passées <span className="text-zinc-500 font-normal">({resolved.length})</span>
          </h2>
          <ul className="space-y-2">
            {resolved.map(inj => (
              <InjuryRow
                key={inj.id}
                injury={inj}
                onPatch={updates => patchInjury(inj.id, updates)}
                onDelete={() => deleteInjury(inj.id)}
                onReactivate={() => patchInjury(inj.id, { status: 'active' })}
              />
            ))}
          </ul>
        </section>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

/* ------------ Sous-composant : ligne d'une blessure ------------ */

function InjuryRow({
  injury,
  onPatch,
  onDelete,
  onResolve,
  onReactivate,
}: {
  injury: AthleteInjury
  onPatch: (updates: Partial<AthleteInjury>) => void
  onDelete: () => void
  onResolve?: () => void
  onReactivate?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [zone, setZone] = useState<BodyZone>(injury.body_zone)
  const [description, setDescription] = useState(injury.description ?? '')
  const [severity, setSeverity] = useState<number>(injury.severity ?? 2)
  const [startedOn, setStartedOn] = useState(injury.started_on ?? '')
  const [resolvedOn, setResolvedOn] = useState(injury.resolved_on ?? '')

  const isResolved = injury.status === 'resolved'

  if (!editing) {
    return (
      <li className={`group flex items-start gap-3 rounded-lg border p-3 ${
        isResolved
          ? 'border-zinc-800 bg-zinc-900/30 opacity-80'
          : 'border-zinc-800 bg-zinc-900/40'
      }`}>
        <SeverityBadge severity={injury.severity} resolved={isResolved} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-white">{injury.body_zone}</span>
            {injury.started_on && (
              <span className="text-xs text-zinc-500">depuis {injury.started_on}</span>
            )}
            {isResolved && injury.resolved_on && (
              <span className="text-xs text-emerald-400">résolue le {injury.resolved_on}</span>
            )}
          </div>
          {injury.description && (
            <p className="mt-1 text-sm text-zinc-400">{injury.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onResolve && (
            <button onClick={onResolve} className="btn-icon" title="Marquer résolue" aria-label="Marquer résolue">
              <Check className="size-4 text-emerald-400" />
            </button>
          )}
          {onReactivate && (
            <button onClick={onReactivate} className="btn-icon" title="Réactiver" aria-label="Réactiver">
              <Plus className="size-4 text-orange-400" />
            </button>
          )}
          <button onClick={() => setEditing(true)} className="btn-icon" title="Éditer" aria-label="Éditer">
            <span className="text-xs text-zinc-400">✎</span>
          </button>
          <button onClick={onDelete} className="btn-icon" title="Supprimer" aria-label="Supprimer">
            <Trash2 className="size-4 text-red-400" />
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="space-y-3 rounded-lg border border-orange-700/50 bg-orange-950/10 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Zone</span>
          <select value={zone} onChange={e => setZone(e.target.value as BodyZone)} className="input-base w-full">
            {BODY_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Date début</span>
          <input type="date" value={startedOn} onChange={e => setStartedOn(e.target.value)} className="input-base w-full" />
        </label>
        {isResolved && (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Date résolution</span>
            <input type="date" value={resolvedOn} onChange={e => setResolvedOn(e.target.value)} className="input-base w-full" />
          </label>
        )}
      </div>
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Description</span>
        <textarea
          rows={2}
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="input-base min-h-16 w-full resize-y px-3 py-2"
        />
      </label>
      <div>
        <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Sévérité</span>
        <div className="flex gap-1">
          {[1,2,3,4,5].map(v => (
            <button
              key={v}
              onClick={() => setSeverity(v)}
              className={`h-9 w-9 rounded-md text-sm font-semibold transition-colors ${
                severity === v ? 'bg-orange-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
              }`}
            >{v}</button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setEditing(false)} className="btn-secondary">
          <X className="size-4" />
          Annuler
        </button>
        <button
          onClick={() => {
            onPatch({
              body_zone: zone,
              description: description || null,
              severity,
              started_on: startedOn || null,
              resolved_on: isResolved ? (resolvedOn || null) : null,
            })
            setEditing(false)
          }}
          className="btn-primary"
        >
          <Check className="size-4" />
          Enregistrer
        </button>
      </div>
    </li>
  )
}

function SeverityBadge({ severity, resolved }: { severity: number | null; resolved: boolean }) {
  if (resolved) {
    return (
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-500 text-sm font-semibold">
        ✓
      </span>
    )
  }
  if (severity == null) {
    return <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-500">—</span>
  }
  const color =
    severity >= 4 ? 'bg-red-600/30 text-red-300 border-red-700/50' :
    severity >= 3 ? 'bg-orange-600/30 text-orange-300 border-orange-700/50' :
    'bg-yellow-600/20 text-yellow-300 border-yellow-700/40'
  return (
    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-sm font-bold ${color}`} title={`Sévérité ${severity}/5`}>
      {severity}
    </span>
  )
}
