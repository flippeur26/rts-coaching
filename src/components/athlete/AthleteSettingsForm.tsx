'use client'

/**
 * AthleteSettingsForm — partagé entre /athlete/parametres et /coach/athletes/[id]/parametres.
 *
 * Permet à l'athlète (ou au coach lié) de configurer :
 *   - système d'unités (kg / lbs)
 *   - poids de la barre
 *   - poids des colliers (par côté)
 *   - liste des disques disponibles dans la salle (cochables)
 *
 * Affiche un aperçu live de l'arrondi d'une charge cible (ex 87.3kg)
 * pour vérifier que l'équipement est cohérent.
 */

import { useEffect, useMemo, useState } from 'react'
import type { AthleteSettings } from '@/types/database'
import { roundToAvailablePlates, formatWeight } from '@/lib/plate-math'
import { Plus, Trash2 } from '@/components/ui/Icon'
import AthleteMedicalSection from './AthleteMedicalSection'

const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 2, 1.5, 1.25, 1, 0.5, 0.25]

interface Props {
  athleteId: string
  athleteName?: string
  /** Si fourni, ces settings initiaux sont utilisés ; sinon fetch côté client */
  initialSettings?: AthleteSettings | null
}

export default function AthleteSettingsForm({ athleteId, athleteName, initialSettings }: Props) {
  const [settings, setSettings] = useState<AthleteSettings | null>(initialSettings ?? null)
  const [loading, setLoading] = useState(!initialSettings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Custom plate input
  const [customPlate, setCustomPlate] = useState('')

  useEffect(() => {
    if (initialSettings) return
    setLoading(true)
    fetch(`/api/athletes/${athleteId}/settings`)
      .then(r => r.json())
      .then((data: AthleteSettings) => {
        setSettings(data)
        setLoading(false)
      })
      .catch(() => {
        setError('Erreur de chargement')
        setLoading(false)
      })
  }, [athleteId, initialSettings])

  async function save(updates: Partial<AthleteSettings>) {
    if (!settings) return
    const next = { ...settings, ...updates }
    setSettings(next)
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/athletes/${athleteId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    setSaving(false)
    if (!res.ok) {
      const e = await res.json().catch(() => null)
      setError(e?.error ?? 'Erreur de sauvegarde')
      return
    }
    const saved: AthleteSettings = await res.json()
    setSettings(saved)
    setSavedAt(Date.now())
  }

  function togglePlate(plate: number) {
    if (!settings) return
    const has = settings.available_plates_kg.includes(plate)
    const next = has
      ? settings.available_plates_kg.filter(p => p !== plate)
      : [...settings.available_plates_kg, plate].sort((a, b) => b - a)
    save({ available_plates_kg: next })
  }

  function addCustomPlate() {
    if (!settings) return
    const v = parseFloat(customPlate.replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0 || v > 50) {
      setError('Poids invalide (0 < x ≤ 50 kg)')
      return
    }
    if (settings.available_plates_kg.includes(v)) {
      setError('Ce disque est déjà ajouté')
      return
    }
    save({
      available_plates_kg: [...settings.available_plates_kg, v].sort((a, b) => b - a),
    })
    setCustomPlate('')
  }


  if (loading) {
    return <p className="text-sm text-zinc-500">Chargement…</p>
  }
  if (!settings) {
    return <p className="text-sm text-red-400">Impossible de charger les paramètres.</p>
  }

  const unit = settings.unit_system

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">
          Paramètres {athleteName ? `de ${athleteName}` : 'athlète'}
        </h1>
        <p className="text-sm text-zinc-500">
          Configure ton équipement pour que les charges recommandées soient automatiquement
          arrondies à ce qui est faisable dans ta salle.
        </p>
      </div>

      {/* Système d'unités */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="mb-3 text-base font-semibold text-white">Système d&apos;unités</h2>
        <div className="flex gap-2">
          {(['metric', 'imperial'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => save({ unit_system: opt })}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                unit === opt
                  ? 'border-orange-500 bg-orange-600/20 text-orange-200'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              {opt === 'metric' ? 'Métrique (kg)' : 'Impérial (lbs)'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Les calculs RTS restent toujours en kg. Seul l&apos;affichage change.
        </p>
      </section>


      {/* Disques disponibles */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="mb-3 text-base font-semibold text-white">Disques disponibles dans la salle</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Coche les disques que tu as en quantité suffisante (au moins 2, un par côté).
        </p>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {STANDARD_PLATES_KG.map(plate => {
            const checked = settings.available_plates_kg.includes(plate)
            return (
              <button
                key={plate}
                onClick={() => togglePlate(plate)}
                className={`rounded-lg border px-3 py-2 text-center text-sm font-mono transition-colors ${
                  checked
                    ? 'border-orange-500 bg-orange-600/20 text-orange-200'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700'
                }`}
              >
                {plate} kg
              </button>
            )
          })}
        </div>

        {/* Disques custom */}
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <span className="mb-2 block text-xs uppercase tracking-wider text-zinc-500">
            Ajouter un disque non standard
          </span>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.25"
              min="0.25"
              max="50"
              value={customPlate}
              onChange={e => setCustomPlate(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomPlate()}
              placeholder="ex : 0.75"
              className="input-base w-32"
            />
            <button onClick={addCustomPlate} className="btn-secondary">
              <Plus className="size-4" />
              Ajouter
            </button>
          </div>

          {/* Liste des custom (= ceux non présents dans STANDARD_PLATES_KG) */}
          {settings.available_plates_kg.filter(p => !STANDARD_PLATES_KG.includes(p)).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {settings.available_plates_kg
                .filter(p => !STANDARD_PLATES_KG.includes(p))
                .map(p => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 rounded-full border border-orange-500/50 bg-orange-600/20 px-3 py-1 text-xs text-orange-200"
                  >
                    {p} kg
                    <button
                      onClick={() => togglePlate(p)}
                      className="ml-1 text-orange-300 hover:text-white"
                      aria-label={`Retirer ${p}kg`}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                ))}
            </div>
          )}
        </div>
      </section>


      {/* Status */}
      <div className="flex items-center gap-3 text-xs">
        {saving && <span className="text-zinc-400">Sauvegarde…</span>}
        {!saving && savedAt && (
          <span className="text-emerald-400">✓ Sauvegardé</span>
        )}
        {error && <span className="text-red-400">{error}</span>}
      </div>

      {/* Section Antécédents + Blessures */}
      <div className="border-t border-zinc-800 pt-6">
        <AthleteMedicalSection athleteId={athleteId} />
      </div>
    </div>
  )
}
