'use client'

/**
 * SlotCardV2 — carte d'un exercice (slot) inspirée de la maquette de référence.
 *
 * Structure :
 *   ┌── Header : drag · pill exercice (couleur catégorie) · actions (add set, planner, edit, delete) ──┐
 *   │  Tableau (≥ md) ou stack mobile :                                                                │
 *   │   ── TARGET  (Weight / Reps / RPE)   →   ACTUAL  (Weight / Reps / RPE)                          │
 *   │   ── ligne computed : E1RM · Tonnage · NL  ║  Total Stress · Peripheral · Central               │
 *   │   ── Notes textarea                                                                              │
 *   └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import { useMemo, useState, useRef, useEffect } from 'react'
import {
  Move,
  Plus,
  ClipboardList,
  SquarePen,
  Trash2,
  MoveRight,
  MoveDown,
  Info,
  X,
} from '@/components/ui/Icon'
import { themeForExercise, type MovementCategory } from '@/lib/movement'
import type { Set as SetRow } from '@/types/database'

export interface SlotSetDraft {
  /** id DB (présent si déjà sauvegardé) */
  id?: string
  /** index d'ordre dans le slot, 1-based */
  set_number: number
  /** prescription */
  weight_prescribed_kg: string
  reps_prescribed: string
  rpe_prescribed: string
  tempo: string
  rom_prescribed: string
  /** réalisé */
  weight_actual_kg: string
  reps_actual: string
  rpe_actual: string
  rom_actual: string
  /** computed (lecture seule, calculés par le trigger DB) */
  e1rm_kg?: number | null
  volume_load_kg?: number | null
  central_stress?: number | null
  peripheral_stress?: number | null
  total_stress?: number | null
  rpe_realization_pct?: number | null
}

export function setRowToDraft(s: SetRow): SlotSetDraft {
  return {
    id: s.id,
    set_number: s.set_number,
    weight_prescribed_kg: s.weight_prescribed_kg?.toString() ?? '',
    reps_prescribed: s.reps_prescribed?.toString() ?? '',
    rpe_prescribed: s.rpe_prescribed?.toString() ?? '',
    tempo: s.tempo ?? '',
    rom_prescribed: s.rom_prescribed ?? '',
    weight_actual_kg: s.weight_actual_kg?.toString() ?? '',
    reps_actual: s.reps_actual?.toString() ?? '',
    rpe_actual: s.rpe_actual?.toString() ?? '',
    rom_actual: s.rom_actual ?? '',
    e1rm_kg: s.e1rm_kg,
    volume_load_kg: s.volume_load_kg,
    central_stress: s.central_stress,
    peripheral_stress: s.peripheral_stress,
    total_stress: s.total_stress,
    rpe_realization_pct: s.rpe_realization_pct,
  }
}

export function emptySetDraft(setNumber: number): SlotSetDraft {
  return {
    set_number: setNumber,
    weight_prescribed_kg: '',
    reps_prescribed: '',
    rpe_prescribed: '',
    tempo: '',
    rom_prescribed: '',
    weight_actual_kg: '',
    reps_actual: '',
    rpe_actual: '',
    rom_actual: '',
  }
}

export interface SlotCardV2Props {
  exerciseName: string
  exerciseFormat?: string | null
  category?: MovementCategory | null
  sets: SlotSetDraft[]
  notes?: string

  /** Mode coach : peut éditer prescription, exercice, ajouter sets… */
  isCoach: boolean
  /** Mode lecture seule pour les valeurs target (athlète n'édite que actual) */
  readonlyTarget?: boolean

  /** ID du bloc (pour progression) */
  blockId?: string
  /** Numéro de la semaine actuelle (pour progression) */
  currentWeek?: number

  // --- callbacks ---
  onSetChange: (index: number, field: keyof SlotSetDraft, value: string) => void
  onSetBlur?: (index: number) => void
  onAddSet?: () => void
  onRemoveSet?: (index: number) => void
  onCopyTargetToActual?: (index: number) => void
  onCopyToNext?: (index: number) => void

  onChangeNotes?: (value: string) => void
  onBlurNotes?: () => void

  onOpenPlanner?: () => void
  onChangeExercise?: () => void
  onRemoveSlot?: () => void

  /** Appelé quand l'utilisateur applique des modificateurs (popover ⓘ).
   *  format = nouvelle valeur de exercise_format (ex: "Spoto · Larsen")
   *  tempo + rom = appliqués à tous les sets du slot */
  onApplyModifiers?: (data: { format: string | null; tempo: string; rom: string }) => void
}

/** Petit helper d'agrégation pour l'affichage du résumé (E1RM max, tonnage somme, etc.) */
function aggregate(sets: SlotSetDraft[]) {
  const e1rms = sets.map(s => s.e1rm_kg).filter((v): v is number => v != null)
  const tonnage = sets.reduce((sum, s) => sum + (s.volume_load_kg ?? 0), 0)
  const nl = sets.reduce((sum, s) => {
    const reps = parseInt(s.reps_actual)
    return sum + (Number.isFinite(reps) ? reps : 0)
  }, 0)
  const cs = sets.reduce((sum, s) => sum + (s.central_stress ?? 0), 0)
  const ps = sets.reduce((sum, s) => sum + (s.peripheral_stress ?? 0), 0)
  const ts = sets.reduce((sum, s) => sum + (s.total_stress ?? 0), 0)

  return {
    e1rm: e1rms.length ? Math.max(...e1rms) : null,
    tonnage: tonnage || null,
    nl: nl || null,
    cs: cs || null,
    ps: ps || null,
    ts: ts || null,
  }
}

export default function SlotCardV2({
  exerciseName,
  exerciseFormat,
  category,
  sets,
  notes = '',
  isCoach,
  readonlyTarget,
  blockId,
  currentWeek,
  onSetChange,
  onSetBlur,
  onAddSet,
  onRemoveSet,
  onCopyTargetToActual,
  onCopyToNext,
  onChangeNotes,
  onBlurNotes,
  onOpenPlanner,
  onChangeExercise,
  onRemoveSlot,
  onApplyModifiers,
}: SlotCardV2Props) {
  const theme = useMemo(() => themeForExercise(exerciseName, category), [exerciseName, category])
  const summary = useMemo(() => aggregate(sets), [sets])
  const [modifierOpen, setModifierOpen] = useState(false)
  const [progressionOpen, setProgressionOpen] = useState(false)
  const [weightEnabled, setWeightEnabled] = useState(true)
  const [progRows, setProgRows] = useState<Record<'weight' | 'reps' | 'rpe' | 'sets', { value: string; type: 'fixed' | 'percent' }>>({
    weight: { value: '0', type: 'fixed' },
    reps:   { value: '0', type: 'fixed' },
    rpe:    { value: '0', type: 'fixed' },
    sets:   { value: '0', type: 'fixed' },
  })

  const styleVars: React.CSSProperties = {
    // exposées pour les classes Tailwind ci-dessous via var(--slot-mvmt-*)
    ['--slot-mvmt-base' as string]: theme.base,
    ['--slot-mvmt-bg' as string]: theme.bg,
    ['--slot-mvmt-border' as string]: theme.border,
    ['--slot-mvmt-fg' as string]: theme.fg,
    ['--slot-mvmt-shadow' as string]: theme.shadow,
  }

  const targetReadonly = readonlyTarget ?? !isCoach

  return (
    <div
      className="card-slot overflow-hidden py-2"
      style={styleVars}
    >
      {/* --- HEADER --------------------------------------------------- */}
      <div className="flex items-center gap-2 px-2 py-1 sm:px-3">
        {isCoach && (
          <button
            type="button"
            className="btn-icon shrink-0 cursor-grab"
            tabIndex={-1}
            aria-label="Drag slot"
            title="Drag slot"
          >
            <Move className="size-4" />
          </button>
        )}

        {/* Pill exercice (couleur catégorie) */}
        <div className="min-w-0 flex-1">
          <span
            className="inline-flex max-w-full items-center rounded-md px-2 py-1.5 font-medium"
            style={{
              backgroundColor: 'var(--slot-mvmt-bg)',
              color: 'var(--slot-mvmt-fg)',
              textShadow: '0 0 6px var(--slot-mvmt-shadow)',
            }}
          >
            <span className="block truncate">{exerciseName || 'Sans nom'}</span>
            {exerciseFormat && (
              <span className="ml-2 truncate text-xs opacity-70">· {exerciseFormat}</span>
            )}
            {sets[0]?.tempo && (
              <span className="ml-1.5 truncate font-mono text-xs opacity-60">· T{sets[0].tempo}</span>
            )}
            {sets[0]?.rom_prescribed && (
              <span className="ml-1.5 truncate font-mono text-xs opacity-60">· {sets[0].rom_prescribed}</span>
            )}
          </span>
        </div>

        {/* Actions */}
        <div className="ml-auto flex shrink-0 flex-row items-center gap-0.5">
          {isCoach && onAddSet && (
            <button className="btn-icon" title="Ajouter un set" aria-label="Ajouter un set" onClick={onAddSet}>
              <Plus className="size-4" />
            </button>
          )}
          {isCoach && onOpenPlanner && (
            <button className="btn-icon" title="Workout planner" aria-label="Workout planner" onClick={onOpenPlanner}>
              <ClipboardList className="size-4" />
            </button>
          )}
          {isCoach && onChangeExercise && (
            <button className="btn-icon" title="Changer d'exercice" aria-label="Changer d'exercice" onClick={onChangeExercise}>
              <SquarePen className="size-4" />
            </button>
          )}
          <button
            className={`btn-icon rounded-full border ${modifierOpen ? 'border-orange-500/60 text-orange-400 bg-orange-500/10' : 'border-zinc-700 text-zinc-400'}`}
            title="Modificateurs d'exercice"
            aria-label="Modificateurs d'exercice"
            onClick={() => setModifierOpen(v => !v)}
          >
            <Info className="size-4" />
          </button>
          {isCoach && (
            <button
              className={`btn-icon rounded-full border ${progressionOpen ? 'border-blue-500/60 text-blue-400 bg-blue-500/10' : 'border-zinc-700 text-zinc-400'}`}
              title="Progression vers semaine suivante"
              aria-label="Progression vers semaine suivante"
              onClick={() => setProgressionOpen(v => !v)}
            >
              <MoveRight className="size-4" />
            </button>
          )}
          {isCoach && onRemoveSlot && (
            <button
              className="btn-icon btn-icon-danger text-red-400"
              title="Supprimer le slot"
              aria-label="Supprimer le slot"
              onClick={onRemoveSlot}
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* --- MODIFICATEURS ------------------------------------------- */}
      {modifierOpen && (
        <ModifierPanel
          exerciseFormat={exerciseFormat}
          sampleTempo={sets[0]?.tempo ?? ''}
          sampleRom={sets[0]?.rom_prescribed ?? ''}
          category={category}
          readonly={!isCoach}
          onClose={() => setModifierOpen(false)}
          onApply={data => {
            onApplyModifiers?.(data)
            setModifierOpen(false)
          }}
        />
      )}

      {/* --- PROGRESSION ------------------------------------------- */}
      {progressionOpen && blockId && currentWeek && (
        <ProgressionPanel
          exerciseName={exerciseName}
          sets={sets}
          blockId={blockId}
          currentWeek={currentWeek}
          weightEnabled={weightEnabled}
          setWeightEnabled={setWeightEnabled}
          rows={progRows}
          setRows={setProgRows}
          onClose={() => setProgressionOpen(false)}
        />
      )}

      {/* --- CORPS ---------------------------------------------------- */}
      <div className="px-2 pb-1 sm:px-3 sm:pb-2">
        {/* DESKTOP : tableau Target ↔ Actual */}
        <table className="-ml-1 hidden w-[calc(100%+0.5rem)] border-separate border-spacing-x-2 border-spacing-y-2 pt-2 md:table">
          <thead className="text-xs uppercase text-zinc-500">
            <tr>
              <th className="w-0" />
              <th colSpan={3} className="text-center font-medium">Target</th>
              <th className="w-0" />
              <th colSpan={3} className="text-center font-medium">Actual</th>
              <th className="w-0" />
            </tr>
            <tr>
              <th className="w-8" />
              <th className="font-medium">Charge (kg)</th>
              <th className="w-16 font-medium">Reps</th>
              <th className="w-16 font-medium">RPE</th>
              <th />
              <th className="font-medium">Charge (kg)</th>
              <th className="w-16 font-medium">Reps</th>
              <th className="w-16 font-medium">RPE</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {sets.map((row, i) => (
              <tr key={row.id ?? `new-${i}`} className="text-sm">
                <td className="text-center text-xs text-zinc-500">{i + 1}</td>

                {/* TARGET */}
                <td>
                  <input
                    className="input-target"
                    inputMode="decimal"
                    type="number"
                    step="2.5"
                    value={row.weight_prescribed_kg}
                    readOnly={targetReadonly}
                    onChange={e => onSetChange(i, 'weight_prescribed_kg', e.target.value)}
                    onBlur={() => onSetBlur?.(i)}
                    placeholder="—"
                  />
                </td>
                <td>
                  <input
                    className="input-target"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={row.reps_prescribed}
                    readOnly={targetReadonly}
                    onChange={e => onSetChange(i, 'reps_prescribed', e.target.value)}
                    onBlur={() => onSetBlur?.(i)}
                    placeholder="—"
                  />
                </td>
                <td>
                  <input
                    className="input-target"
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min={5}
                    max={10}
                    value={row.rpe_prescribed}
                    readOnly={targetReadonly}
                    onChange={e => onSetChange(i, 'rpe_prescribed', e.target.value)}
                    onBlur={() => onSetBlur?.(i)}
                    placeholder="—"
                  />
                </td>

                {/* Flèche Target → Actual */}
                <td className="text-center">
                  {onCopyTargetToActual && (
                    <button
                      className="btn-icon"
                      title="Copier la prescription dans le réalisé"
                      aria-label="Copier la prescription dans le réalisé"
                      onClick={() => onCopyTargetToActual(i)}
                    >
                      <MoveRight className="size-4" />
                    </button>
                  )}
                </td>

                {/* ACTUAL */}
                <td>
                  <input
                    className="input-actual"
                    type="number"
                    inputMode="decimal"
                    step="2.5"
                    value={row.weight_actual_kg}
                    onChange={e => onSetChange(i, 'weight_actual_kg', e.target.value)}
                    onBlur={() => onSetBlur?.(i)}
                    placeholder="—"
                  />
                </td>
                <td>
                  <input
                    className="input-actual"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={row.reps_actual}
                    onChange={e => onSetChange(i, 'reps_actual', e.target.value)}
                    onBlur={() => onSetBlur?.(i)}
                    placeholder="—"
                  />
                </td>
                <td>
                  <RpeInput
                    value={row.rpe_actual}
                    realizationPct={row.rpe_realization_pct}
                    onChange={v => onSetChange(i, 'rpe_actual', v)}
                    onBlur={() => onSetBlur?.(i)}
                  />
                </td>

                {/* Actions */}
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    {isCoach && onCopyToNext && i < sets.length - 1 && (
                      <button
                        className="btn-icon"
                        title="Appliquer ce set au set suivant"
                        aria-label="Appliquer ce set au set suivant"
                        onClick={() => onCopyToNext(i)}
                      >
                        <MoveDown className="size-4" />
                      </button>
                    )}
                    {isCoach && onRemoveSet && (
                      <button
                        className="btn-icon btn-icon-danger"
                        title="Supprimer ce set"
                        aria-label="Supprimer ce set"
                        onClick={() => onRemoveSet(i)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {/* Ligne computed : labels */}
            <tr className="text-center text-xs text-zinc-500 [&_td]:pt-3 [&_td]:pb-1">
              <td />
              <td>E1RM</td>
              <td>Tonnage</td>
              <td>NL</td>
              <td />
              <td>Total Stress</td>
              <td>Peripheral Stress</td>
              <td>Central Stress</td>
              <td />
            </tr>
            <tr className="text-center text-sm text-zinc-300 [&_td]:pb-2">
              <td />
              <td className="font-mono">{summary.e1rm != null ? summary.e1rm.toFixed(1) : '—'}</td>
              <td className="font-mono">{summary.tonnage != null ? summary.tonnage.toFixed(0) : '—'}</td>
              <td className="font-mono">{summary.nl ?? '—'}</td>
              <td />
              <td className="font-mono">{summary.ts != null ? summary.ts.toFixed(2) : '—'}</td>
              <td className="font-mono">{summary.ps != null ? summary.ps.toFixed(2) : '—'}</td>
              <td className="font-mono">{summary.cs != null ? summary.cs.toFixed(2) : '—'}</td>
              <td />
            </tr>
          </tbody>
        </table>

        {/* MOBILE : stack vertical (Weight / Reps / RPE) */}
        <div className="md:hidden">
          <div className="mb-2 grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-center text-center text-[11px] uppercase text-zinc-500">
            <div />
            <div className="font-medium">Charge (kg)</div>
            <div className="font-medium">Reps</div>
            <div className="font-medium">RPE</div>
            <div />
          </div>

          <div className="space-y-2">
            {sets.map((row, i) => (
              <div key={row.id ?? `new-${i}`} className="rounded-md p-1">
                {/* TARGET row */}
                <div className="mb-1 grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-center gap-1 text-center text-xs">
                  <div className="text-zinc-600">{i + 1}</div>
                  <input
                    className="input-target"
                    inputMode="decimal" type="number" step="2.5"
                    value={row.weight_prescribed_kg}
                    readOnly={targetReadonly}
                    onChange={e => onSetChange(i, 'weight_prescribed_kg', e.target.value)}
                    onBlur={() => onSetBlur?.(i)}
                    placeholder="—"
                  />
                  <input
                    className="input-target"
                    type="number" inputMode="numeric" min={1}
                    value={row.reps_prescribed}
                    readOnly={targetReadonly}
                    onChange={e => onSetChange(i, 'reps_prescribed', e.target.value)}
                    onBlur={() => onSetBlur?.(i)}
                    placeholder="—"
                  />
                  <input
                    className="input-target"
                    type="number" inputMode="decimal" step="0.5" min={5} max={10}
                    value={row.rpe_prescribed}
                    readOnly={targetReadonly}
                    onChange={e => onSetChange(i, 'rpe_prescribed', e.target.value)}
                    onBlur={() => onSetBlur?.(i)}
                    placeholder="—"
                  />
                  <div className="flex justify-end">
                    {onCopyTargetToActual && (
                      <button
                        className="btn-icon"
                        title="Copier dans le réalisé"
                        aria-label="Copier dans le réalisé"
                        onClick={() => onCopyTargetToActual(i)}
                      >
                        <MoveDown className="size-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* ACTUAL row */}
                <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-center gap-1">
                  <div />
                  <input
                    className="input-actual"
                    inputMode="decimal" type="number" step="2.5"
                    value={row.weight_actual_kg}
                    onChange={e => onSetChange(i, 'weight_actual_kg', e.target.value)}
                    onBlur={() => onSetBlur?.(i)}
                    placeholder="—"
                  />
                  <input
                    className="input-actual"
                    type="number" inputMode="numeric" min={1}
                    value={row.reps_actual}
                    onChange={e => onSetChange(i, 'reps_actual', e.target.value)}
                    onBlur={() => onSetBlur?.(i)}
                    placeholder="—"
                  />
                  <RpeInput
                    value={row.rpe_actual}
                    realizationPct={row.rpe_realization_pct}
                    onChange={v => onSetChange(i, 'rpe_actual', v)}
                    onBlur={() => onSetBlur?.(i)}
                    className="input-actual"
                  />
                  <div className="flex justify-end gap-1">
                    {isCoach && onCopyToNext && i < sets.length - 1 && (
                      <button
                        className="btn-icon"
                        title="Appliquer ce set au set suivant"
                        aria-label="Appliquer ce set au set suivant"
                        onClick={() => onCopyToNext(i)}
                      >
                        <MoveDown className="size-4" />
                      </button>
                    )}
                    {isCoach && onRemoveSet && (
                      <button
                        className="btn-icon btn-icon-danger"
                        title="Supprimer ce set"
                        aria-label="Supprimer ce set"
                        onClick={() => onRemoveSet(i)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* computed mobile */}
          <div className="mt-3 space-y-1">
            <div className="grid grid-cols-3 gap-2 text-center text-[11px] uppercase text-zinc-500">
              <div>E1RM</div><div>Tonnage</div><div>NL</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm font-mono text-zinc-300">
              <div>{summary.e1rm != null ? summary.e1rm.toFixed(1) : '—'}</div>
              <div>{summary.tonnage != null ? summary.tonnage.toFixed(0) : '—'}</div>
              <div>{summary.nl ?? '—'}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px] uppercase text-zinc-500 pt-1">
              <div>Total Stress</div><div>Periph.</div><div>Central</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm font-mono text-zinc-300">
              <div>{summary.ts != null ? summary.ts.toFixed(2) : '—'}</div>
              <div>{summary.ps != null ? summary.ps.toFixed(2) : '—'}</div>
              <div>{summary.cs != null ? summary.cs.toFixed(2) : '—'}</div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {onChangeNotes && (
          <div className="px-1 pt-2 sm:px-0">
            <textarea
              className="input-base min-h-16 resize-y px-3 py-2 text-xs md:text-sm"
              placeholder="Notes…"
              maxLength={4000}
              value={notes}
              onChange={e => onChangeNotes(e.target.value)}
              onBlur={onBlurNotes}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------------- */

const VARIATION_CHIPS = [
  { key: 'Pause (Spoto)',  label: 'Pause / Spoto',    hint: 'Touche le chest / parallèle sans rebond' },
  { key: 'Larsen',        label: 'Larsen',            hint: 'Bench pieds levés' },
  { key: 'Cale',          label: 'Cale (Board)',      hint: 'Board press — amplitude réduite' },
  { key: 'High Bar',      label: 'High Bar',          hint: 'Barre haute (squat)' },
  { key: 'Low Bar',       label: 'Low Bar',           hint: 'Barre basse (squat)' },
  { key: 'Box',           label: 'Box',               hint: 'Box squat / box bench' },
  { key: 'Déficit',       label: 'Déficit',           hint: 'Plaque sous les pieds (deadlift)' },
  { key: 'Une main',      label: 'Une main',          hint: 'Unilatéral — côté dominant' },
  { key: 'Une jambe',     label: 'Une jambe',         hint: 'Unilatéral — membre inférieur' },
  { key: 'Close grip',    label: 'Close Grip',        hint: 'Prise serrée (bench/press)' },
  { key: 'Wide grip',     label: 'Wide Grip',         hint: 'Prise large' },
  { key: 'Sumo',          label: 'Sumo',              hint: 'Stance sumo (deadlift)' },
  { key: 'Conventionnel', label: 'Conventionnel',     hint: 'Stance conventionnel (deadlift)' },
  { key: 'Pin press',     label: 'Pin Press',         hint: 'Depuis les taquets — amplitude partielle' },
  { key: 'Tempo',         label: 'Tempo imposé',      hint: 'Utiliser le champ tempo ci-dessous' },
]

/** Parse exercise_format pour retrouver les variations cochées */
function parseVariations(exerciseFormat: string | null | undefined): string[] {
  if (!exerciseFormat) return []
  return exerciseFormat
    .split('·')
    .map(s => s.trim())
    .filter(Boolean)
}

/** Recompose exercise_format depuis une liste de variations + un custom text */
function buildFormat(variations: string[], custom: string): string | null {
  const parts = [
    ...variations,
    ...(custom.trim() ? [custom.trim()] : []),
  ]
  return parts.length ? parts.join(' · ') : null
}

interface ModifierPanelProps {
  exerciseFormat?: string | null
  sampleTempo: string
  sampleRom: string
  category?: MovementCategory | null
  readonly?: boolean
  onClose: () => void
  onApply: (data: { format: string | null; tempo: string; rom: string }) => void
}

function ModifierPanel({
  exerciseFormat,
  sampleTempo,
  sampleRom,
  readonly,
  onClose,
  onApply,
}: ModifierPanelProps) {
  const knownKeys = new Set(VARIATION_CHIPS.map(c => c.key))
  const initial = parseVariations(exerciseFormat)
  // Sépare les variations connues des custom
  const initialKnown = initial.filter(v => knownKeys.has(v))
  const initialCustom = initial.filter(v => !knownKeys.has(v)).join(' · ')

  const [selected, setSelected] = useState<Set<string>>(new Set(initialKnown))
  const [custom, setCustom] = useState(initialCustom)
  const [tempo, setTempo] = useState(sampleTempo)
  const [rom, setRom] = useState(sampleRom)

  const toggle = (key: string) => {
    if (readonly) return
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Maintenir l'ordre d'affichage des chips selon VARIATION_CHIPS
  const orderedSelected = VARIATION_CHIPS.filter(c => selected.has(c.key)).map(c => c.key)

  return (
    <div className="mx-2 mb-2 mt-1 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm sm:mx-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Modificateurs
        </span>
        <button onClick={onClose} className="btn-icon" aria-label="Fermer">
          <X className="size-3.5" />
        </button>
      </div>

      {/* Variations */}
      <div className="mb-3">
        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-500">Variations</p>
        <div className="flex flex-wrap gap-1.5">
          {VARIATION_CHIPS.map(chip => {
            const on = selected.has(chip.key)
            return (
              <button
                key={chip.key}
                type="button"
                disabled={readonly}
                title={chip.hint}
                onClick={() => toggle(chip.key)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  on
                    ? 'border-orange-500/70 bg-orange-500/15 text-orange-300'
                    : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-default'
                }`}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Custom freetext */}
      <div className="mb-3">
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">
          Variation libre
        </label>
        <input
          type="text"
          disabled={readonly}
          placeholder="ex : Anderson squat, Close stance…"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          className="input-base text-xs"
        />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        {/* Tempo */}
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">
            Tempo <span className="normal-case text-zinc-600">(chiffres only)</span>
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-2 text-xs font-mono text-zinc-600">T</span>
            <input
              type="text"
              disabled={readonly}
              placeholder="ex : 3110"
              value={tempo}
              onChange={e => setTempo(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="input-base pl-5 text-xs font-mono"
            />
          </div>
        </div>

        {/* ROM */}
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">
            Range of Motion <span className="normal-case text-zinc-600">(%)</span>
          </label>
          <div className="relative">
            <input
              type="number"
              disabled={readonly}
              placeholder="100"
              min={10}
              max={100}
              step={5}
              value={rom.replace('%', '')}
              onChange={e => setRom(e.target.value ? `${e.target.value}%` : '')}
              className="input-base pr-7 text-xs font-mono"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500">%</span>
          </div>
        </div>
      </div>

      {/* Résumé + bouton */}
      {!readonly && (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[11px] text-zinc-500">
            {buildFormat(orderedSelected, custom) ?? <span className="italic">Aucune variation</span>}
            {tempo ? <span className="ml-2 font-mono">T{tempo}</span> : null}
            {rom ? <span className="ml-2 font-mono">{rom}</span> : null}
          </span>
          <button
            type="button"
            onClick={() =>
              onApply({
                format: buildFormat(orderedSelected, custom),
                tempo,
                rom: rom ? rom.replace('%', '') + '%' : '',
              })
            }
            className="btn-primary shrink-0 py-1 text-xs"
          >
            Appliquer à tous les sets
          </button>
        </div>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------------- */
function RpeInput({
  value,
  realizationPct,
  onChange,
  onBlur,
  className,
}: {
  value: string
  realizationPct?: number | null
  onChange: (v: string) => void
  onBlur?: () => void
  className?: string
}) {
  const color =
    realizationPct == null
      ? ''
      : realizationPct >= 95 && realizationPct <= 105
      ? 'text-emerald-400'
      : realizationPct < 90 || realizationPct > 115
      ? 'text-red-400'
      : 'text-amber-400'
  return (
    <input
      className={`${className ?? 'input-actual'} ${color}`.trim()}
      type="number"
      inputMode="decimal"
      step="0.5"
      min={5}
      max={10}
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder="—"
      title={realizationPct != null ? `Réalisation RPE : ${realizationPct.toFixed(0)}%` : undefined}
    />
  )
}

/* ----------------------------------------------------------------------- */
interface ProgRow {
  value: string
  type: 'fixed' | 'percent'
}

function ProgressionPanel({
  exerciseName,
  sets,
  blockId,
  currentWeek,
  weightEnabled,
  setWeightEnabled,
  rows,
  setRows,
  onClose,
}: {
  exerciseName: string
  sets: SlotSetDraft[]
  blockId: string
  currentWeek: number
  weightEnabled: boolean
  setWeightEnabled: (v: boolean) => void
  rows: Record<'weight' | 'reps' | 'rpe' | 'sets', ProgRow>
  setRows: React.Dispatch<React.SetStateAction<Record<'weight' | 'reps' | 'rpe' | 'sets', ProgRow>>>
  onClose: () => void
}) {
  const [copyModifiers, setCopyModifiers] = useState(true)
  const [detectPerf, setDetectPerf] = useState(true)
  const [applyToAll, setApplyToAll] = useState(true)
  const [applying, setApplying] = useState(false)

  const setRow = (field: keyof typeof rows, patch: Partial<ProgRow>) =>
    setRows(prev => ({ ...prev, [field]: { ...prev[field], ...patch } }))

  const LABELS: Record<string, string> = { weight: 'Weight', reps: 'Reps', rpe: 'RPE', sets: 'Séries' }

  const handleApply = () => {
    const activeFields = (Object.keys(rows) as (keyof typeof rows)[]).filter(f => {
      if (f === 'weight') return weightEnabled && Number(rows[f].value) !== 0
      return Number(rows[f].value) !== 0 && !isNaN(Number(rows[f].value))
    })
    for (const field of activeFields) {
      const row = rows[field]
      fetch(`/api/blocks/${blockId}/progress-week`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_week: currentWeek,
          target_week: currentWeek + 1,
          exercises: [exerciseName],
          field,
          type: field === 'weight' ? row.type : 'fixed',
          value: Number(row.value),
          copy_modifiers: copyModifiers,
          detect_overperformance: detectPerf,
          apply_to_all_weeks: applyToAll,
        }),
      })
    }
    onClose()
  }

  return (
    <div className="mx-2 mb-2 mt-1 rounded-lg border border-blue-700/40 bg-blue-950/20 p-3 text-sm sm:mx-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">
          Progression vers semaine suivante
        </span>
        <button onClick={onClose} className="btn-icon" aria-label="Fermer">
          <X className="size-3.5" />
        </button>
      </div>

      {/* Lignes */}
      <div className="mb-3 space-y-2">
        {(Object.keys(rows) as (keyof typeof rows)[]).map(field => {
          const row = rows[field]
          return (
            <div key={field} className="flex items-center gap-2">
              {field === 'weight' && (
                <input
                  type="checkbox"
                  checked={weightEnabled}
                  onChange={e => setWeightEnabled(e.target.checked)}
                  className="w-4 h-4 shrink-0"
                />
              )}
              <span className={`w-14 text-xs font-medium shrink-0 ${field === 'weight' && !weightEnabled ? 'text-zinc-500' : 'text-zinc-300'}`}>
                {LABELS[field]}
              </span>
              {field === 'weight' && (
                <div className="flex rounded overflow-hidden border border-zinc-700 shrink-0">
                  <button type="button" onClick={() => setRow('weight', { type: 'fixed' })}
                    className={`px-2 py-0.5 text-[10px] transition-colors ${row.type === 'fixed' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400'}`}>
                    kg
                  </button>
                  <button type="button" onClick={() => setRow('weight', { type: 'percent' })}
                    className={`px-2 py-0.5 text-[10px] transition-colors ${row.type === 'percent' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400'}`}>
                    %
                  </button>
                </div>
              )}
              <input
                type="number"
                disabled={field === 'weight' && !weightEnabled}
                value={row.value}
                onChange={e => setRow(field, { value: e.target.value })}
                step={field === 'weight' ? '2.5' : field === 'rpe' ? '0.5' : '1'}
                className="input-base text-xs w-24 disabled:opacity-40"
              />
            </div>
          )
        })}
      </div>

      {/* Options */}
      <div className="space-y-1.5 mb-3 border-t border-zinc-800 pt-2.5">
        {[
          { label: 'Copier tempo/ROM/variations', val: copyModifiers, set: setCopyModifiers },
          { label: 'Détection intelligente (réduire si surperformance)', val: detectPerf, set: setDetectPerf },
          { label: 'Appliquer à toutes les semaines suivantes', val: applyToAll, set: setApplyToAll },
        ].map(({ label, val, set }) => (
          <label key={label} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className="w-4 h-4" />
            <span className="text-xs text-zinc-300">{label}</span>
          </label>
        ))}
      </div>

      <button onClick={handleApply} disabled={applying} className="btn-primary w-full py-1.5 text-xs">
        {applying ? 'Application…' : 'Appliquer à la semaine suivante'}
      </button>
    </div>
  )
}
