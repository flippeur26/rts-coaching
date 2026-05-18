'use client'

/**
 * SaisieSeanceClient (athlète) — réutilise SlotCardV2 en mode `readonlyTarget`.
 *
 * - regroupe les sets par exercice (slot)
 * - target affiché en grisé (lecture seule)
 * - actual : 3 inputs (kg / reps / RPE) avec auto-save onBlur
 * - métriques calculées affichées après sauvegarde
 * - bilan en bas : ressenti, poids de corps, notes, "Terminer la séance"
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Session, Set as SetRow, BlockDisplayConfig } from '@/types/database'
import SlotCardV2, { type SlotSetDraft, setRowToDraft } from '@/components/calendrier/SlotCardV2'

interface Props {
  session: Session
  initialSets: SetRow[]
  displayConfig?: BlockDisplayConfig | null
}

interface Slot {
  localId: string
  exerciseName: string
  exerciseFormat: string | null
  sets: SlotSetDraft[]
}

function uid() {
  return Math.random().toString(36).slice(2, 11)
}

function setsToSlots(sets: SetRow[]): Slot[] {
  const out: Slot[] = []
  for (const s of sets) {
    const last = out[out.length - 1]
    if (
      last &&
      last.exerciseName === s.exercise_name &&
      (last.exerciseFormat ?? '') === (s.exercise_format ?? '')
    ) {
      last.sets.push(setRowToDraft(s))
    } else {
      out.push({
        localId: uid(),
        exerciseName: s.exercise_name,
        exerciseFormat: s.exercise_format,
        sets: [setRowToDraft(s)],
      })
    }
  }
  return out
}

export default function SaisieSeanceClient({ session, initialSets, displayConfig }: Props) {
  const router = useRouter()
  const [slots, setSlots] = useState<Slot[]>(() => setsToSlots(initialSets))
  const [sessionFeel, setSessionFeel] = useState(session.session_feel?.toString() ?? '')
  const [bodyweight, setBodyweight] = useState(session.bodyweight_kg?.toString() ?? '')
  const [notesAthlete, setNotesAthlete] = useState(session.notes_athlete ?? '')
  const [finishing, setFinishing] = useState(false)
  const [savingSetId, setSavingSetId] = useState<string | null>(null)

  const updateSet = useCallback(
    (slotId: string, setIndex: number, field: keyof SlotSetDraft, value: string) => {
      setSlots(prev =>
        prev.map(slot => {
          if (slot.localId !== slotId) return slot
          const sets = slot.sets.map((s, i) => (i === setIndex ? { ...s, [field]: value } : s))
          return { ...slot, sets }
        }),
      )
    },
    [],
  )

  const copyTargetToActual = useCallback((slotId: string, setIndex: number) => {
    setSlots(prev =>
      prev.map(slot => {
        if (slot.localId !== slotId) return slot
        const sets = slot.sets.map((s, i) =>
          i === setIndex
            ? {
                ...s,
                weight_actual_kg: s.weight_actual_kg || s.weight_prescribed_kg,
                reps_actual: s.reps_actual || s.reps_prescribed,
                rpe_actual: s.rpe_actual || s.rpe_prescribed,
              }
            : s,
        )
        return { ...slot, sets }
      }),
    )
  }, [])

  const saveSet = useCallback(
    async (slotId: string, setIndex: number) => {
      const slot = slots.find(s => s.localId === slotId)
      if (!slot) return
      const row = slot.sets[setIndex]
      if (!row || !row.id) return
      // ne sauvegarder que s'il y a au moins une valeur actual
      if (!row.weight_actual_kg && !row.reps_actual && !row.rpe_actual) return

      setSavingSetId(row.id)
      const res = await fetch(`/api/sets/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weight_actual_kg: row.weight_actual_kg ? parseFloat(row.weight_actual_kg) : null,
          reps_actual: row.reps_actual ? parseInt(row.reps_actual) : null,
          rpe_actual: row.rpe_actual ? parseFloat(row.rpe_actual) : null,
        }),
      })
      if (res.ok) {
        const updated: SetRow = await res.json()
        setSlots(prev =>
          prev.map(s =>
            s.localId === slotId
              ? {
                  ...s,
                  sets: s.sets.map((ss, i) =>
                    i === setIndex
                      ? {
                          ...ss,
                          e1rm_kg: updated.e1rm_kg,
                          volume_load_kg: updated.volume_load_kg,
                          central_stress: updated.central_stress,
                          peripheral_stress: updated.peripheral_stress,
                          total_stress: updated.total_stress,
                          rpe_realization_pct: updated.rpe_realization_pct,
                        }
                      : ss,
                  ),
                }
              : s,
          ),
        )
      }
      setSavingSetId(null)
    },
    [slots],
  )

  async function terminerSeance() {
    setFinishing(true)
    await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed',
        session_feel: sessionFeel ? parseInt(sessionFeel) : null,
        bodyweight_kg: bodyweight ? parseFloat(bodyweight) : null,
        notes_athlete: notesAthlete || null,
      }),
    })
    setFinishing(false)
    router.push('/athlete/programme')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Poids de corps */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
        <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
          Poids de corps aujourd&apos;hui (kg)
        </label>
        <input
          type="number"
          step="0.1"
          value={bodyweight}
          onChange={e => setBodyweight(e.target.value)}
          placeholder="ex : 82.5"
          className="input-base w-32"
        />
      </div>

      {/* Slots */}
      {slots.length === 0 ? (
        <div className="py-10 text-center text-sm text-zinc-500">
          Aucun set prescrit pour cette séance.
        </div>
      ) : (
        slots.map(slot => (
          <div
            key={slot.localId}
            className={savingSetId && slot.sets.some(s => s.id === savingSetId) ? 'opacity-70' : ''}
          >
            <SlotCardV2
              exerciseName={slot.exerciseName}
              exerciseFormat={slot.exerciseFormat}
              sets={slot.sets}
              isCoach={false}
              readonlyTarget
              displayConfig={displayConfig ?? undefined}
              onSetChange={(i, field, value) => updateSet(slot.localId, i, field, value)}
              onSetBlur={i => saveSet(slot.localId, i)}
              onCopyTargetToActual={i => copyTargetToActual(slot.localId, i)}
            />
          </div>
        ))
      )}

      {/* Bilan */}
      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            Ressenti global (1 = très mauvais, 5 = excellent)
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(v => (
              <button
                key={v}
                onClick={() => setSessionFeel(v.toString())}
                className={`h-12 w-12 rounded-xl text-base font-bold transition-colors ${
                  sessionFeel === v.toString()
                    ? 'bg-orange-600 text-white'
                    : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            Notes pour le coach
          </label>
          <textarea
            value={notesAthlete}
            onChange={e => setNotesAthlete(e.target.value)}
            rows={3}
            placeholder="Comment s'est passée la séance ?"
            className="input-base min-h-24 resize-y px-3 py-2"
          />
        </div>
      </div>

      {/* Terminer */}
      {session.status !== 'completed' && (
        <button
          onClick={terminerSeance}
          disabled={finishing}
          className="w-full rounded-xl bg-emerald-600 py-4 text-base font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          {finishing ? 'Sauvegarde…' : 'Terminer la séance'}
        </button>
      )}
    </div>
  )
}
