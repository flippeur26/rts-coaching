'use client'

/**
 * SeanceModal — vue détaillée d'une séance (coach ou athlète).
 *
 * Refonte v2 : regroupement par "slot" (exercice = 1 SlotCardV2) avec
 * - colonnes Target / Actual
 * - métriques calculées par le trigger DB
 * - panneau Workout Planner pour recommander une charge à partir d'un e1RM
 * - tab "Bilan" (sensation, poids de corps, notes athlète)
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Session, Set as SetRow, Exercise } from '@/types/database'
import SlotCardV2, {
  type SlotSetDraft,
  setRowToDraft,
  emptySetDraft,
} from './SlotCardV2'
import WorkoutPlanner from './WorkoutPlanner'
import { ExerciseSelectorModal } from '@/components/coach/ExerciseSelectorModal'
import { Plus, X, ChevronLeft, ChevronRight } from '@/components/ui/Icon'

type SessionWithSets = Session & { sets: SetRow[] }

interface Slot {
  /** local-only id pour les nouveaux slots (avant persistance) */
  localId: string
  exerciseName: string
  exerciseFormat: string | null
  category?: Exercise['category'] | null
  sets: SlotSetDraft[]
}

interface Props {
  session: SessionWithSets
  blockId?: string
  currentWeek?: number
  onClose: () => void
  onUpdate: () => void
  isCoach: boolean
}

/* ----------------- helpers ---------------------------------------------- */

function uid() {
  return Math.random().toString(36).slice(2, 11)
}

/** Convertit la liste plate de sets DB en groupe de slots (regroupés par exercice + format). */
function setsToSlots(sets: SetRow[]): Slot[] {
  // Tri défensif : si l'API renvoie les sets dans un ordre arbitraire,
  // le regroupement par exercice consécutif ci-dessous duplique les slots.
  const ordered = [...sets].sort((a, b) => a.set_number - b.set_number)
  const groups: Slot[] = []
  for (const s of ordered) {
    const last = groups[groups.length - 1]
    if (
      last &&
      last.exerciseName === s.exercise_name &&
      (last.exerciseFormat ?? '') === (s.exercise_format ?? '')
    ) {
      last.sets.push(setRowToDraft(s))
    } else {
      groups.push({
        localId: uid(),
        exerciseName: s.exercise_name,
        exerciseFormat: s.exercise_format,
        sets: [setRowToDraft(s)],
      })
    }
  }
  return groups
}

/** Aplatit les slots en sets prêts pour POST /sessions/:id/sets, set_number recalculé global. */
function slotsToFlatSetsPayload(slots: Slot[]) {
  let setNumber = 1
  const out: Array<{
    exercise_name: string
    exercise_format: string | null
    set_number: number
    weight_prescribed_kg: number | null
    reps_prescribed: number | null
    rpe_prescribed: number | null
    tempo: string | null
    rom_prescribed: string | null
    weight_actual_kg: number | null
    reps_actual: number | null
    rpe_actual: number | null
    rom_actual: string | null
    _existingId?: string
  }> = []
  for (const slot of slots) {
    for (const s of slot.sets) {
      out.push({
        exercise_name: slot.exerciseName,
        exercise_format: slot.exerciseFormat || null,
        set_number: setNumber++,
        weight_prescribed_kg: s.weight_prescribed_kg ? parseFloat(s.weight_prescribed_kg) : null,
        reps_prescribed: s.reps_prescribed ? parseInt(s.reps_prescribed) : null,
        rpe_prescribed: s.rpe_prescribed ? parseFloat(s.rpe_prescribed) : null,
        tempo: s.tempo || null,
        rom_prescribed: s.rom_prescribed || null,
        weight_actual_kg: s.weight_actual_kg ? parseFloat(s.weight_actual_kg) : null,
        reps_actual: s.reps_actual ? parseInt(s.reps_actual) : null,
        rpe_actual: s.rpe_actual ? parseFloat(s.rpe_actual) : null,
        rom_actual: s.rom_actual || null,
        _existingId: s.id,
      })
    }
  }
  return out
}

/* ----------------- composant ------------------------------------------- */

export default function SeanceModal({ session, blockId, currentWeek, onClose, onUpdate, isCoach }: Props) {
  const [slots, setSlots] = useState<Slot[]>(() => setsToSlots(session.sets ?? []))
  // IDs des sets présents au chargement — sert à détecter ceux supprimés
  // côté UI pour les DELETE en DB lors de savePrescription.
  const initialSetIdsRef = useRef<Set<string>>(
    new Set((session.sets ?? []).map(s => s.id)),
  )
  const [notesCoach, setNotesCoach] = useState(session.notes_coach ?? '')
  const [notesAthlete, setNotesAthlete] = useState(session.notes_athlete ?? '')
  const [sessionFeel, setSessionFeel] = useState(session.session_feel?.toString() ?? '')
  const [bodyweight, setBodyweight] = useState(session.bodyweight_kg?.toString() ?? '')
  const [activeTab, setActiveTab] = useState<'prescription' | 'bilan'>('prescription')
  const [saving, setSaving] = useState(false)
  const [savingSetId, setSavingSetId] = useState<string | null>(null)
  const [plannerSlotId, setPlannerSlotId] = useState<string | null>(null)
  const [exerciseSelectorOpen, setExerciseSelectorOpen] = useState<{ slotId: string | null } | null>(null)

  // index global du slot ouvert pour la navigation flèches

  const totalsRef = useRef<HTMLDivElement>(null)

  /* ---------- mutations slots ---------- */

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

  const addSetToSlot = useCallback((slotId: string, init?: Partial<SlotSetDraft>) => {
    setSlots(prev =>
      prev.map(slot => {
        if (slot.localId !== slotId) return slot
        const next = emptySetDraft(slot.sets.length + 1)
        if (init?.weight_prescribed_kg) next.weight_prescribed_kg = init.weight_prescribed_kg
        if (init?.reps_prescribed) next.reps_prescribed = init.reps_prescribed
        if (init?.rpe_prescribed) next.rpe_prescribed = init.rpe_prescribed
        return { ...slot, sets: [...slot.sets, next] }
      }),
    )
  }, [])

  const removeSetFromSlot = useCallback((slotId: string, setIndex: number) => {
    setSlots(prev =>
      prev.map(slot => {
        if (slot.localId !== slotId) return slot
        const sets = slot.sets.filter((_, i) => i !== setIndex).map((s, i) => ({ ...s, set_number: i + 1 }))
        return { ...slot, sets }
      }),
    )
  }, [])

  const copySetToNext = useCallback((slotId: string, setIndex: number) => {
    setSlots(prev =>
      prev.map(slot => {
        if (slot.localId !== slotId) return slot
        const sourceSet = slot.sets[setIndex]
        if (!sourceSet || setIndex >= slot.sets.length - 1) return slot
        const sets = slot.sets.map((s, i) =>
          i === setIndex + 1
            ? {
                ...s,
                weight_prescribed_kg: sourceSet.weight_prescribed_kg,
                reps_prescribed: sourceSet.reps_prescribed,
                rpe_prescribed: sourceSet.rpe_prescribed,
                tempo: sourceSet.tempo,
                rom_prescribed: sourceSet.rom_prescribed,
              }
            : s,
        )
        return { ...slot, sets }
      }),
    )
  }, [])

  const removeSlot = useCallback((slotId: string) => {
    setSlots(prev => prev.filter(s => s.localId !== slotId))
  }, [])

  const applyModifiers = useCallback(
    (slotId: string, data: { format: string | null; tempo: string; rom: string }) => {
      setSlots(prev =>
        prev.map(slot => {
          if (slot.localId !== slotId) return slot
          return {
            ...slot,
            exerciseFormat: data.format,
            sets: slot.sets.map(s => ({
              ...s,
              tempo: data.tempo,
              rom_prescribed: data.rom,
            })),
          }
        }),
      )
    },
    [],
  )

  const addSlot = useCallback((exercise?: Exercise) => {
    const newSlot: Slot = {
      localId: uid(),
      exerciseName: exercise?.name ?? '',
      exerciseFormat: null,
      category: exercise?.category,
      sets: [emptySetDraft(1)],
    }
    setSlots(prev => [...prev, newSlot])
    setExerciseSelectorOpen(null)
  }, [])

  const replaceSlotExercise = useCallback((slotId: string, exercise: Exercise) => {
    setSlots(prev =>
      prev.map(s =>
        s.localId === slotId
          ? { ...s, exerciseName: exercise.name, category: exercise.category }
          : s,
      ),
    )
    setExerciseSelectorOpen(null)
  }, [])

  /* ---------- persistance ---------- */
  const saveSet = useCallback(
    async (slotId: string, setIndex: number) => {
      const slot = slots.find(s => s.localId === slotId)
      if (!slot) return
      const row = slot.sets[setIndex]
      if (!row || !row.id) return

      setSavingSetId(row.id)
      const payload = isCoach
        ? {
            exercise_name: slot.exerciseName || undefined,
            exercise_format: slot.exerciseFormat || null,
            weight_prescribed_kg: row.weight_prescribed_kg ? parseFloat(row.weight_prescribed_kg) : null,
            reps_prescribed: row.reps_prescribed ? parseInt(row.reps_prescribed) : null,
            rpe_prescribed: row.rpe_prescribed ? parseFloat(row.rpe_prescribed) : null,
            tempo: row.tempo || null,
            rom_prescribed: row.rom_prescribed || null,
            weight_actual_kg: row.weight_actual_kg ? parseFloat(row.weight_actual_kg) : null,
            reps_actual: row.reps_actual ? parseInt(row.reps_actual) : null,
            rpe_actual: row.rpe_actual ? parseFloat(row.rpe_actual) : null,
            rom_actual: row.rom_actual || null,
          }
        : {
            weight_actual_kg: row.weight_actual_kg ? parseFloat(row.weight_actual_kg) : null,
            reps_actual: row.reps_actual ? parseInt(row.reps_actual) : null,
            rpe_actual: row.rpe_actual ? parseFloat(row.rpe_actual) : null,
            rom_actual: row.rom_actual || null,
          }

      const res = await fetch(`/api/sets/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    [slots, isCoach],
  )

  const savingRef = useRef(false)
  async function savePrescription() {
    if (!isCoach) return
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)

    try {
      const flat = slotsToFlatSetsPayload(slots)
      const newSets = flat.filter(s => !s._existingId)
      const existingSets = flat.filter(s => s._existingId)

      // 1) Supprimer en DB les sets retirés côté UI (ceux présents au chargement
      //    mais plus dans les slots). Sinon ils réapparaissent au reload et
      //    cassent le regroupement par exercice (sets en double / éclatés).
      const keptIds = new Set(existingSets.map(s => s._existingId as string))
      const deletedIds = Array.from(initialSetIdsRef.current).filter(id => !keptIds.has(id))
      if (deletedIds.length > 0) {
        await Promise.all(
          deletedIds.map(id => fetch(`/api/sets/${id}`, { method: 'DELETE' })),
        )
        deletedIds.forEach(id => initialSetIdsRef.current.delete(id))
      }

      // Renumeroter via numéros temporaires hauts pour éviter les collisions
      // sur la contrainte UNIQUE (session_id, set_number)
      const tempOffset = 10000
      await Promise.all(
        existingSets.map(s =>
          fetch(`/api/sets/${s._existingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ set_number: s.set_number + tempOffset }),
          }),
        ),
      )

      let createdSets: SetRow[] = []
      if (newSets.length > 0) {
        const res = await fetch(`/api/sessions/${session.id}/sets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            newSets.map(s => {
              const copy = { ...s } as Partial<typeof s>
              delete copy._existingId
              return copy
            }),
          ),
        })
        if (res.ok) {
          const data = await res.json()
          createdSets = Array.isArray(data) ? data : [data]
        }
      }

      // Met à jour les IDs locaux des nouveaux sets pour éviter les doublons
      // si l'utilisateur reclique sauvegarder avant fermeture de la modal
      if (createdSets.length > 0) {
        let createdIdx = 0
        setSlots(prev =>
          prev.map(slot => ({
            ...slot,
            sets: slot.sets.map(s => {
              if (s.id) return s
              const created = createdSets[createdIdx++]
              return created ? { ...s, id: created.id } : s
            }),
          })),
        )
        createdSets.forEach(s => initialSetIdsRef.current.add(s.id))
      }

      await Promise.all(
        existingSets.map(s =>
          fetch(`/api/sets/${s._existingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              exercise_name: s.exercise_name,
              exercise_format: s.exercise_format,
              set_number: s.set_number,
              weight_prescribed_kg: s.weight_prescribed_kg,
              reps_prescribed: s.reps_prescribed,
              rpe_prescribed: s.rpe_prescribed,
              tempo: s.tempo,
              rom_prescribed: s.rom_prescribed,
              weight_actual_kg: s.weight_actual_kg,
              reps_actual: s.reps_actual,
              rpe_actual: s.rpe_actual,
              rom_actual: s.rom_actual,
            }),
          }),
        ),
      )

      await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes_coach: notesCoach || null }),
      })

      onUpdate()
      onClose()
    } finally {
      setSaving(false)
      savingRef.current = false
    }
  }

  async function saveBilan() {
    setSaving(true)
    await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes_athlete: notesAthlete || null,
        session_feel: sessionFeel ? parseInt(sessionFeel) : null,
        bodyweight_kg: bodyweight ? parseFloat(bodyweight) : null,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }),
    })
    setSaving(false)
    onUpdate()
    onClose()
  }

  /* ---------- totaux séance ---------- */
  const totals = useMemo(() => {
    const allSets = slots.flatMap(s => s.sets)
    const tonnage = allSets.reduce((sum, s) => sum + (s.volume_load_kg ?? 0), 0)
    const cs = allSets.reduce((sum, s) => sum + (s.central_stress ?? 0), 0)
    const ps = allSets.reduce((sum, s) => sum + (s.peripheral_stress ?? 0), 0)
    const ts = allSets.reduce((sum, s) => sum + (s.total_stress ?? 0), 0)
    return { tonnage, cs, ps, ts }
  }, [slots])

  const plannerSlot = plannerSlotId ? slots.find(s => s.localId === plannerSlotId) : null
  const plannerInitialE1RM = useMemo(() => {
    if (!plannerSlot) return null
    const e1rms = plannerSlot.sets.map(s => s.e1rm_kg).filter((v): v is number => v != null)
    return e1rms.length > 0 ? Math.max(...e1rms) : null
  }, [plannerSlot])

  /* ---------- UI ---------- */
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
      <div className="my-6 w-full max-w-6xl rounded-2xl border border-zinc-800 bg-zinc-950">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <button className="btn-icon" aria-label="Séance précédente" disabled>
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="font-brand truncate text-xl font-semibold text-white">
              {session.notes_coach || 'Séance sans titre'}
            </h1>
            <p className="text-xs text-zinc-500">
              {format(parseISO(session.scheduled_date), 'EEEE d MMMM yyyy', { locale: fr })}
              {session.week_in_block ? ` · Semaine ${session.week_in_block}` : ''}
              {' · '}
              <span
                className={
                  session.status === 'completed'
                    ? 'text-emerald-400'
                    : session.status === 'in_progress'
                    ? 'text-orange-400'
                    : 'text-zinc-400'
                }
              >
                {session.status === 'completed'
                  ? 'Terminée'
                  : session.status === 'in_progress'
                  ? 'En cours'
                  : 'Prescrite'}
              </span>
            </p>
          </div>
          <button className="btn-icon" aria-label="Séance suivante" disabled>
            <ChevronRight className="size-4" />
          </button>
          <button onClick={onClose} className="btn-icon ml-1" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('prescription')}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'prescription'
                ? 'border-b-2 border-orange-500 text-orange-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Prescription &amp; Réalisé
          </button>
          <button
            onClick={() => setActiveTab('bilan')}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'bilan'
                ? 'border-b-2 border-orange-500 text-orange-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Bilan
          </button>
        </div>

        {activeTab === 'prescription' && (
          <div className="p-4">
            {/* Colonne slots */}
            <div className="space-y-3">
              {/* Notes coach */}
              {isCoach && (
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
                    Notes coach (titre / consignes)
                  </label>
                  <input
                    type="text"
                    value={notesCoach}
                    onChange={e => setNotesCoach(e.target.value)}
                    placeholder="ex : Lundi — squat lourd"
                    className="input-base"
                  />
                </div>
              )}

              {/* Bouton ajout slot (coach) */}
              {isCoach && (
                <div className="flex items-center justify-end">
                  <button
                    className="btn-secondary"
                    onClick={() => setExerciseSelectorOpen({ slotId: null })}
                  >
                    <Plus className="size-4" />
                    Ajouter un exercice
                  </button>
                </div>
              )}

              {slots.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
                  Aucun exercice prescrit pour cette séance.
                </div>
              ) : (
                slots.map((slot, idx) => (
                  <div
                    key={slot.localId}
                    className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_320px]"
                  >
                    <div className={savingSetId && slot.sets.some(s => s.id === savingSetId) ? 'opacity-70' : ''}>
                      <SlotCardV2
                        exerciseName={slot.exerciseName}
                        exerciseFormat={slot.exerciseFormat}
                        category={slot.category}
                        sets={slot.sets}
                        isCoach={isCoach}
                        blockId={blockId || session.block_id}
                        currentWeek={currentWeek || session.week_in_block}
                        onSetChange={(i, field, value) => updateSet(slot.localId, i, field, value)}
                        onSetBlur={i => saveSet(slot.localId, i)}
                        onAddSet={() => addSetToSlot(slot.localId)}
                        onRemoveSet={i => removeSetFromSlot(slot.localId, i)}
                        onCopyTargetToActual={i => copyTargetToActual(slot.localId, i)}
                        onCopyToNext={isCoach ? i => copySetToNext(slot.localId, i) : undefined}
                        onOpenPlanner={() => setPlannerSlotId(slot.localId)}
                        onChangeExercise={() => setExerciseSelectorOpen({ slotId: slot.localId })}
                        onRemoveSlot={() => removeSlot(slot.localId)}
                        onApplyModifiers={data => applyModifiers(slot.localId, data)}
                      />
                    </div>
                    {plannerSlot?.localId === slot.localId && isCoach && (
                      <WorkoutPlanner
                        exerciseName={plannerSlot.exerciseName}
                        athleteId={session.athlete_id}
                        initialE1RM={plannerInitialE1RM}
                        onClose={() => setPlannerSlotId(null)}
                        onAddSet={({ weight, reps, rpe }) => {
                          addSetToSlot(plannerSlot.localId, {
                            weight_prescribed_kg: weight.toString(),
                            reps_prescribed: reps.toString(),
                            rpe_prescribed: rpe != null ? rpe.toString() : '',
                          })
                        }}
                      />
                    )}
                  </div>
                ))
              )}

              {/* Totaux */}
              {(totals.tonnage || totals.ts) ? (
                <div ref={totalsRef} className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 sm:grid-cols-4">
                  <Stat label="Tonnage total" value={totals.tonnage ? `${totals.tonnage.toFixed(0)} kg` : '—'} />
                  <Stat label="CS total" value={totals.cs ? totals.cs.toFixed(2) : '—'} color="text-blue-300" />
                  <Stat label="PS total" value={totals.ps ? totals.ps.toFixed(2) : '—'} color="text-amber-300" />
                  <Stat label="TS total" value={totals.ts ? totals.ts.toFixed(2) : '—'} color="text-emerald-300" />
                </div>
              ) : null}
            </div>
          </div>
        )}

        {activeTab === 'bilan' && (
          <div className="space-y-5 p-4 md:max-w-xl">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Sensation séance (1–5)
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(v => (
                    <button
                      key={v}
                      onClick={() => setSessionFeel(v.toString())}
                      className={`h-10 w-10 rounded-lg text-sm font-semibold transition-colors ${
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
                  Poids de corps (kg)
                </label>
                <input
                  type="number"
                  value={bodyweight}
                  onChange={e => setBodyweight(e.target.value)}
                  step="0.1"
                  placeholder="ex : 82.5"
                  className="input-base w-32"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Notes de l&apos;athlète
              </label>
              <textarea
                value={notesAthlete}
                onChange={e => setNotesAthlete(e.target.value)}
                rows={5}
                placeholder="Comment s'est passée la séance ?"
                className="input-base min-h-32 resize-y px-3 py-2"
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col-reverse items-stretch gap-2 border-t border-zinc-800 p-4 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="btn-secondary">
            Fermer
          </button>

          {activeTab === 'prescription' && isCoach && (
            <button onClick={savePrescription} disabled={saving} className="btn-primary">
              {saving ? 'Sauvegarde…' : 'Sauvegarder la prescription'}
            </button>
          )}

          {activeTab === 'bilan' && (
            <button
              onClick={saveBilan}
              disabled={saving}
              className="btn-primary bg-emerald-600 hover:bg-emerald-500"
            >
              {saving ? 'Sauvegarde…' : 'Marquer comme terminée'}
            </button>
          )}
        </div>
      </div>

      {/* Exercise selector */}
      {exerciseSelectorOpen && (
        <ExerciseSelectorModal
          onClose={() => setExerciseSelectorOpen(null)}
          onSelect={ex => {
            const exercise = ex as Exercise
            if (exerciseSelectorOpen.slotId) replaceSlotExercise(exerciseSelectorOpen.slotId, exercise)
            else addSlot(exercise)
          }}
        />
      )}
    </div>
  )
}

/* ---------- petits sous-composants ---------- */
function Stat({ label, value, color = 'text-zinc-100' }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`font-mono text-base font-semibold ${color}`}>{value}</div>
    </div>
  )
}

