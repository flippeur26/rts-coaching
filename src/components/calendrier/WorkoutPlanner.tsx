'use client'

/**
 * WorkoutPlanner — panneau latéral de recommandation de charge.
 *
 * Inputs :  e1RM connu (kg)  +  Reps cibles  +  RPE cible OU %1RM
 * Output :  charge recommandée (kg) + reps  + indication "X% of max"
 *
 * Conformément à la maquette de référence :
 *   - toggle "RPE / %"  (mode RPE par défaut)
 *   - Percent Mod (offset en points de pourcentage, ±)
 *   - "Round" checkbox (arrondit à 2.5 kg)
 *   - bouton "Add Set" → injecte un nouveau set dans le slot
 */

import { useState, useMemo, useEffect } from 'react'
import { pctOf1RM, roundToStep } from '@/lib/rts-calc'
import { roundToAvailablePlates, formatWeight, unitLabel } from '@/lib/plate-math'
import type { AthleteSettings } from '@/types/database'
import { X } from '@/components/ui/Icon'

export interface WorkoutPlannerProps {
  exerciseName: string
  athleteId?: string
  /** e1RM courant pour cet exercice (chargé depuis l'historique de l'athlète si dispo) */
  initialE1RM?: number | null
  /** callback fermer panneau */
  onClose: () => void
  /** callback "Add Set" : injecte un set avec ces valeurs prescrites */
  onAddSet: (set: { weight: number; reps: number; rpe: number | null }) => void
}

export default function WorkoutPlanner({
  exerciseName,
  athleteId,
  initialE1RM,
  onClose,
  onAddSet,
}: WorkoutPlannerProps) {
  const [e1rm, setE1rm] = useState<string>(initialE1RM != null ? initialE1RM.toString() : '')
  const [reps, setReps] = useState<string>('5')
  const [rpe, setRpe] = useState<string>('8')
  const [percentMode, setPercentMode] = useState<boolean>(false)
  const [percent, setPercent] = useState<string>('80')
  const [percentMod, setPercentMod] = useState<string>('0')
  const [round, setRound] = useState<boolean>(true)
  const [savedE1RM, setSavedE1RM] = useState<number | null>(null)
  const [settings, setSettings] = useState<AthleteSettings | null>(null)

  useEffect(() => {
    if (initialE1RM != null) setE1rm(initialE1RM.toString())
  }, [initialE1RM])

  // Charger l'E1RM sauvegardé depuis exercise_e1rm et l'appliquer directement
  useEffect(() => {
    if (!athleteId || !exerciseName) return
    fetch(`/api/exercise-e1rm/${athleteId}?exercise=${encodeURIComponent(exerciseName)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.e1rm_kg) {
          setSavedE1RM(data.e1rm_kg)
          setE1rm(data.e1rm_kg.toString())
        }
      })
      .catch(() => {})
  }, [athleteId, exerciseName])

  // Charger les settings athlète (équipement + unités)
  useEffect(() => {
    if (!athleteId) return
    fetch(`/api/athletes/${athleteId}/settings`)
      .then(r => r.ok ? r.json() : null)
      .then((data: AthleteSettings | null) => {
        if (data) setSettings(data)
      })
      .catch(() => {})
  }, [athleteId])

  const unit = settings?.unit_system ?? 'metric'

  const computed = useMemo(() => {
    const e = parseFloat(e1rm)
    const r = parseInt(reps)
    if (!Number.isFinite(e) || !Number.isFinite(r)) return null

    let basePct: number | null
    let usedRpe: number | null = null

    if (percentMode) {
      basePct = parseFloat(percent)
      if (!Number.isFinite(basePct)) return null
    } else {
      const rp = parseFloat(rpe)
      if (!Number.isFinite(rp)) return null
      basePct = pctOf1RM(r, rp)
      usedRpe = rp
    }
    if (basePct == null) return null

    const offset = parseFloat(percentMod) || 0
    const finalPct = basePct + offset
    let load = (e * finalPct) / 100
    if (round) {
      // Si on a les settings de l'athlète, on arrondit aux disques disponibles.
      // Sinon, fallback sur palier 2.5 kg.
      if (settings) {
        load = roundToAvailablePlates(load, {
          bar_weight_kg: settings.bar_weight_kg,
          collar_weight_kg: settings.collar_weight_kg,
          available_plates_kg: settings.available_plates_kg,
        })
      } else {
        load = roundToStep(load, 2.5)
      }
    }
    return { load, pct: finalPct, rpe: usedRpe }
  }, [e1rm, reps, rpe, percent, percentMod, percentMode, round, settings])

  function handleAdd() {
    if (!computed) return
    onAddSet({
      weight: computed.load,
      reps: parseInt(reps),
      rpe: percentMode ? null : parseFloat(rpe),
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500">Workout Planner</p>
          <h3 className="text-base font-semibold text-white">{exerciseName || 'Sans exercice'}</h3>
        </div>
        <button onClick={onClose} className="btn-icon" aria-label="Fermer">
          <X className="size-4" />
        </button>
      </div>

      {/* E1RM */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
            E1RM {savedE1RM && <span className="text-orange-400">(Max: {formatWeight(savedE1RM, unit)})</span>}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={e1rm}
              onChange={e => setE1rm(e.target.value)}
              placeholder="ex: 150"
              className="input-base w-28 text-center"
            />
            <span className="text-sm text-zinc-400">kg</span>
          </div>
        </div>
      </div>

      {/* Protocole */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-zinc-400">Protocole</span>
          <ToggleRpePercent
            value={percentMode ? 'percent' : 'rpe'}
            onChange={v => setPercentMode(v === 'percent')}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Reps</label>
            <input
              type="number" inputMode="numeric" min={1} max={20}
              value={reps}
              onChange={e => setReps(e.target.value)}
              className="input-base text-center"
            />
          </div>

          {percentMode ? (
            <div>
              <label className="mb-1 block text-xs text-zinc-500">% 1RM</label>
              <input
                type="number" inputMode="decimal" step="0.5" min={20} max={110}
                value={percent}
                onChange={e => setPercent(e.target.value)}
                className="input-base text-center"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs text-zinc-500">RPE</label>
              <input
                type="number" inputMode="decimal" step="0.5" min={5} max={10}
                value={rpe}
                onChange={e => setRpe(e.target.value)}
                className="input-base text-center"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-zinc-500">% Mod</label>
            <input
              type="number" inputMode="decimal" step="0.5" min={-30} max={30}
              value={percentMod}
              onChange={e => setPercentMod(e.target.value)}
              className="input-base text-center"
            />
          </div>
        </div>
      </div>

      {/* Recommandation */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-zinc-400">Recommandation</span>
          {computed && (
            <span className="text-xs text-zinc-400 font-mono">{computed.pct.toFixed(1)}% du max</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Charge ({unitLabel(unit)})</label>
            <div className="input-base flex items-center justify-center font-mono text-base font-semibold text-white">
              {computed ? formatWeight(computed.load, unit).replace(/\s?(kg|lbs)$/, '') : '—'}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Reps</label>
            <div className="input-base flex items-center justify-center font-mono text-base font-semibold text-white">
              {Number.isFinite(parseInt(reps)) ? parseInt(reps) : '—'}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-zinc-300" title={settings ? 'Arrondi sur les disques configurés dans Réglages' : 'Arrondi simple au palier 2.5 kg (configure tes disques dans Réglages)'}>
            <input
              type="checkbox"
              checked={round}
              onChange={e => setRound(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-2 focus:ring-orange-500/40"
            />
            {settings ? 'Arrondir aux disques dispo' : 'Round (palier 2,5 kg)'}
          </label>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!computed}
            className="btn-primary"
          >
            Ajouter le set
          </button>
        </div>
      </div>
    </div>
  )
}

function ToggleRpePercent({
  value,
  onChange,
}: {
  value: 'rpe' | 'percent'
  onChange: (v: 'rpe' | 'percent') => void
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-900 p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange('rpe')}
        className={`px-2 py-1 rounded ${value === 'rpe' ? 'bg-orange-600 text-white' : 'text-zinc-400'}`}
      >
        RPE
      </button>
      <button
        type="button"
        onClick={() => onChange('percent')}
        className={`px-2 py-1 rounded ${value === 'percent' ? 'bg-orange-600 text-white' : 'text-zinc-400'}`}
      >
        %
      </button>
    </div>
  )
}
