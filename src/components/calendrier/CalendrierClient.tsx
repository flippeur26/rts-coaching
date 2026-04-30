'use client'

/**
 * CalendrierClient — vue mensuelle du calendrier coach (inspirée maquette de réf).
 *
 * - 7 colonnes (Sun → Sat), 5–6 lignes (semaines complètes)
 * - chaque jour peut contenir : workouts (cyan), TRAC entries (rouge),
 *   bodyweight, compétitions, notes
 * - clic "+" → menu type d'entrée (workout / bw / trac / note / comp)
 * - clic sur un workout → ouvre SeanceModal
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  parseISO,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Session, Set as SetRow, DailyTracker, Competition } from '@/types/database'
import SeanceModal from './SeanceModal'
import EntryTypeMenu, { type EntryType } from './EntryTypeMenu'
import { ChevronLeft, ChevronRight, Plus, Dumbbell, Heart, Scale, Trophy, NotebookPen } from '@/components/ui/Icon'

type SessionWithSets = Session & { sets: SetRow[] }

interface Props {
  athletes: { id: string; full_name: string }[]
  coachId: string
}

interface DayEntries {
  workouts: SessionWithSets[]
  trackers: DailyTracker[]
  competitions: Competition[]
}

export default function CalendrierClient({ athletes, coachId }: Props) {
  const [selectedAthleteId, setSelectedAthleteId] = useState(athletes[0]?.id ?? '')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [sessions, setSessions] = useState<SessionWithSets[]>([])
  const [trackers, setTrackers] = useState<DailyTracker[]>([])
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSession, setSelectedSession] = useState<SessionWithSets | null>(null)

  // Menu type d'entrée
  const [menuOpen, setMenuOpen] = useState<{ date: string; anchor: { top: number; left: number } } | null>(null)

  // Quick entry inline (bw / trac) — ouvre une mini-modal sur le jour
  const [quickEntry, setQuickEntry] = useState<{ type: EntryType; date: string } | null>(null)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days = useMemo(() => {
    const out: Date[] = []
    let d = gridStart
    while (d <= gridEnd) {
      out.push(d)
      d = addDays(d, 1)
    }
    return out
  }, [gridStart, gridEnd])

  const fromIso = format(gridStart, 'yyyy-MM-dd')
  const toIso = format(gridEnd, 'yyyy-MM-dd')

  /* ---------- chargement ---------- */
  const load = useCallback(async () => {
    if (!selectedAthleteId) return
    setLoading(true)

    const res = await fetch(
      `/api/calendar-entries?athlete_id=${selectedAthleteId}&from=${fromIso}&to=${toIso}`,
    )

    if (res.ok) {
      const data = await res.json()
      setSessions(data.sessions ?? [])
      setTrackers(data.trackers ?? [])
      setCompetitions(data.competitions ?? [])
    }
    setLoading(false)
  }, [selectedAthleteId, fromIso, toIso])

  useEffect(() => {
    load()
  }, [load])

  /* ---------- helpers indexation par jour ---------- */
  const entriesByDay = useMemo(() => {
    const map: Record<string, DayEntries> = {}
    for (const s of sessions) {
      const k = s.scheduled_date
      ;(map[k] ??= { workouts: [], trackers: [], competitions: [] }).workouts.push(s)
    }
    for (const t of trackers) {
      ;(map[t.date] ??= { workouts: [], trackers: [], competitions: [] }).trackers.push(t)
    }
    for (const c of competitions) {
      ;(map[c.competition_date] ??= { workouts: [], trackers: [], competitions: [] }).competitions.push(c)
    }
    return map
  }, [sessions, trackers, competitions])

  /* ---------- création d'entrée ---------- */
  const handleSelectEntryType = useCallback(
    async (date: string, type: EntryType) => {
      if (!selectedAthleteId) return
      if (type === 'workout') {
        // Crée immédiatement la séance vide puis ouvre la modal
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            athlete_id: selectedAthleteId,
            scheduled_date: date,
          }),
        })
        if (res.ok) {
          const data: Session = await res.json()
          await load()
          // ouvrir modal
          setSelectedSession({ ...data, sets: [] })
        }
        return
      }
      if (type === 'bodyweight' || type === 'trac' || type === 'note' || type === 'competition') {
        setQuickEntry({ type, date })
      }
    },
    [selectedAthleteId, load],
  )

  /* ---------- UI ---------- */
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Calendrier</h1>
          <p className="text-sm text-zinc-500">{format(currentMonth, 'MMMM yyyy', { locale: fr })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {athletes.length > 0 && (
            <select
              value={selectedAthleteId}
              onChange={e => setSelectedAthleteId(e.target.value)}
              className="input-base h-9 w-48"
            >
              {athletes.map(a => (
                <option key={a.id} value={a.id}>
                  {a.full_name}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1 rounded-md border border-zinc-800 p-0.5">
            <button
              onClick={() => setCurrentMonth(m => subMonths(m, 1))}
              className="btn-icon"
              aria-label="Mois précédent"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="px-3 text-sm text-zinc-300 hover:text-white"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={() => setCurrentMonth(m => addMonths(m, 1))}
              className="btn-icon"
              aria-label="Mois suivant"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Grille mensuelle */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        {/* Jours de la semaine */}
        <div className="grid grid-cols-7 border-b border-zinc-800 text-xs text-zinc-500">
          {['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map(d => (
            <div key={d} className="px-2 py-2 text-center">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map(day => {
            const isoDay = format(day, 'yyyy-MM-dd')
            const isToday = isSameDay(day, new Date())
            const inMonth = isSameMonth(day, currentMonth)
            const e = entriesByDay[isoDay]

            return (
              <DayCell
                key={isoDay}
                day={day}
                inMonth={inMonth}
                isToday={isToday}
                entries={e}
                loading={loading}
                onOpenSession={s => setSelectedSession(s)}
                onAddClick={(anchor) => setMenuOpen({ date: isoDay, anchor })}
              />
            )
          })}
        </div>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        <Legend Icon={Dumbbell} label="Workout" color="var(--entry-workout)" />
        <Legend Icon={Heart} label="TRAC entry" color="var(--entry-trac)" />
        <Legend Icon={Scale} label="Poids de corps" color="var(--entry-bw)" />
        <Legend Icon={Trophy} label="Compétition" color="var(--entry-comp)" />
        <Legend Icon={NotebookPen} label="Note" color="var(--entry-note)" />
      </div>

      {/* Menu type d'entrée */}
      <EntryTypeMenu
        open={menuOpen != null}
        anchor={menuOpen?.anchor ?? null}
        onSelect={t => menuOpen && handleSelectEntryType(menuOpen.date, t)}
        onClose={() => setMenuOpen(null)}
      />

      {/* Quick entry (bodyweight / trac / note / competition) */}
      {quickEntry && (
        <QuickEntryModal
          type={quickEntry.type}
          date={quickEntry.date}
          athleteId={selectedAthleteId}
          coachId={coachId}
          onClose={() => setQuickEntry(null)}
          onSaved={() => {
            setQuickEntry(null)
            load()
          }}
        />
      )}

      {/* Modal séance */}
      {selectedSession && (
        <SeanceModal
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
          onUpdate={load}
          isCoach
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------- */

function DayCell({
  day,
  inMonth,
  isToday,
  entries,
  loading,
  onOpenSession,
  onAddClick,
}: {
  day: Date
  inMonth: boolean
  isToday: boolean
  entries?: DayEntries
  loading: boolean
  onOpenSession: (s: SessionWithSets) => void
  onAddClick: (anchor: { top: number; left: number }) => void
}) {
  const cellRef = useRef<HTMLDivElement>(null)
  const dayNum = format(day, 'd')

  return (
    <div
      ref={cellRef}
      className={`group relative min-h-32 border-b border-r border-zinc-800/60 p-1.5 transition-colors ${
        inMonth ? '' : 'bg-zinc-950/40 text-zinc-600'
      } ${isToday ? 'bg-orange-500/[0.04]' : ''}`}
    >
      <div className="flex items-center justify-between text-xs">
        <span className={`font-mono ${isToday ? 'rounded-full bg-orange-600 px-2 py-0.5 text-white' : 'text-zinc-400'}`}>
          {dayNum}
        </span>
        <button
          className="btn-icon opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7"
          aria-label="Ajouter une entrée"
          onClick={ev => {
            const r = (ev.currentTarget as HTMLButtonElement).getBoundingClientRect()
            onAddClick({ top: r.bottom + 4, left: r.left })
          }}
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="mt-1 space-y-1">
        {loading && !entries ? (
          <div className="h-6 animate-pulse rounded bg-zinc-900" />
        ) : (
          <>
            {entries?.workouts.map(s => (
              <button
                key={s.id}
                onClick={() => onOpenSession(s)}
                title={s.notes_coach ?? 'Workout'}
                className={`flex w-full items-center gap-1 truncate rounded border px-2 py-1 text-left text-xs transition-colors hover:brightness-110 ${
                  s.status === 'completed'
                    ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-200'
                    : s.status === 'in_progress'
                    ? 'border-amber-700/60 bg-amber-950/40 text-amber-200'
                    : 'border-cyan-700/60 bg-cyan-950/30 text-cyan-200'
                }`}
              >
                <Dumbbell className="size-3 shrink-0" style={{ color: 'var(--entry-workout)' }} />
                <span className="truncate">{s.notes_coach || 'Workout'}</span>
              </button>
            ))}

            {entries?.trackers.map(t => (
              <div key={t.id} className="flex items-center gap-1 rounded border border-red-700/40 bg-red-950/30 px-2 py-0.5 text-[11px] text-red-200" title={`TRAC : récup ${t.recovery ?? '—'} / motiv ${t.motivation ?? '—'}`}>
                <Heart className="size-3 shrink-0" style={{ color: 'var(--entry-trac)' }} />
                <span className="truncate">TRAC{t.bodyweight_kg ? ` · ${t.bodyweight_kg} kg` : ''}</span>
              </div>
            ))}

            {entries?.competitions.map(c => (
              <div key={c.id} className="flex items-center gap-1 rounded border border-amber-700/40 bg-amber-950/30 px-2 py-0.5 text-[11px] text-amber-200" title={c.name}>
                <Trophy className="size-3 shrink-0" style={{ color: 'var(--entry-comp)' }} />
                <span className="truncate">{c.name}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function Legend({ Icon, label, color }: { Icon: typeof Dumbbell; label: string; color: string }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5" style={{ color }} />
      <span>{label}</span>
    </div>
  )
}

/* ---------------------------------------------------------------------- */

function QuickEntryModal({
  type,
  date,
  athleteId,
  coachId,
  onClose,
  onSaved,
}: {
  type: EntryType
  date: string
  athleteId: string
  coachId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [bodyweight, setBodyweight] = useState('')
  const [generalFatigue, setGeneralFatigue] = useState('')
  const [motivation, setMotivation] = useState('')
  const [recovery, setRecovery] = useState('')
  const [sleepQuality, setSleepQuality] = useState('')
  const [notes, setNotes] = useState('')
  const [compName, setCompName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)

    if (type === 'bodyweight' || type === 'trac') {
      const payload = {
        athlete_id: athleteId,
        date,
        bodyweight_kg: bodyweight ? parseFloat(bodyweight) : null,
        general_fatigue: generalFatigue ? parseInt(generalFatigue) : null,
        motivation: motivation ? parseInt(motivation) : null,
        recovery: recovery ? parseInt(recovery) : null,
        sleep_quality: sleepQuality ? parseInt(sleepQuality) : null,
        notes: notes || null,
      }
      const res = await fetch('/api/traceurs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        setError(
          (e?.error ?? 'Erreur lors de la sauvegarde') +
            ' — vérifiez que la migration 005_coach_writes_trackers.sql est appliquée.',
        )
        setSaving(false)
        return
      }
    } else if (type === 'note') {
      // une note = une session vide avec notes_coach renseignée
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athlete_id: athleteId,
          scheduled_date: date,
          notes_coach: notes || 'Note',
        }),
      })
      if (!res.ok) {
        setError('Erreur lors de la sauvegarde de la note')
        setSaving(false)
        return
      }
    } else if (type === 'competition') {
      const res = await fetch('/api/competitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athlete_id: athleteId,
          coach_id: coachId,
          competition_date: date,
          name: compName || 'Compétition',
        }),
      })
      if (!res.ok) {
        setError('Erreur lors de la création de la compétition')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    onSaved()
  }

  const titleByType: Record<EntryType, string> = {
    workout: 'Workout',
    bodyweight: 'Poids de corps',
    trac: 'TRAC entry',
    note: 'Note',
    competition: 'Compétition',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <div>
            <h2 className="text-base font-semibold text-white">{titleByType[type]}</h2>
            <p className="text-xs text-zinc-500">{date}</p>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="space-y-3 p-4 text-sm">
          {type === 'bodyweight' && (
            <Field label="Poids de corps (kg)">
              <input
                type="number"
                step="0.1"
                value={bodyweight}
                onChange={e => setBodyweight(e.target.value)}
                placeholder="ex : 82.5"
                className="input-base w-full"
                autoFocus
              />
            </Field>
          )}

          {type === 'trac' && (
            <>
              <Field label="Poids de corps (kg)">
                <input
                  type="number"
                  step="0.1"
                  value={bodyweight}
                  onChange={e => setBodyweight(e.target.value)}
                  className="input-base w-full"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fatigue générale (1–5)">
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={generalFatigue}
                    onChange={e => setGeneralFatigue(e.target.value)}
                    className="input-base"
                  />
                </Field>
                <Field label="Motivation (1–5)">
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={motivation}
                    onChange={e => setMotivation(e.target.value)}
                    className="input-base"
                  />
                </Field>
                <Field label="Récupération (1–5)">
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={recovery}
                    onChange={e => setRecovery(e.target.value)}
                    className="input-base"
                  />
                </Field>
                <Field label="Qualité sommeil (1–10)">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={sleepQuality}
                    onChange={e => setSleepQuality(e.target.value)}
                    className="input-base"
                  />
                </Field>
              </div>
              <Field label="Notes">
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="input-base min-h-16 resize-y px-3 py-2"
                />
              </Field>
            </>
          )}

          {type === 'note' && (
            <Field label="Note">
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="input-base min-h-24 resize-y px-3 py-2"
                placeholder="Note pour cette journée..."
                autoFocus
              />
            </Field>
          )}

          {type === 'competition' && (
            <Field label="Nom de la compétition">
              <input
                value={compName}
                onChange={e => setCompName(e.target.value)}
                placeholder="ex : Championnat régional"
                className="input-base w-full"
                autoFocus
              />
            </Field>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 p-4">
          <button onClick={onClose} className="btn-secondary">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
        </div>
      </div>
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

// Empêche unused-warning si parseISO finit non utilisé en cas de refacto
void parseISO
