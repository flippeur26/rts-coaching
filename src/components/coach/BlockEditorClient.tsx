'use client'

/**
 * BlockEditorClient — Éditeur d'un bloc d'entraînement.
 *
 * Concept :
 *   Le coach définit la SEMAINE 1 = "semaine type" (n séances avec leurs sets).
 *   Puis il génère les semaines 2..N en cliquant sur "Générer les semaines suivantes".
 *   Chaque semaine devient ensuite éditable individuellement (modification des charges,
 *   reps, RPE, ROM par rapport au template).
 *
 * UI :
 *   - Header bloc (nom, type, taper, dates)
 *   - Tabs SEMAINES (S1, S2, …)
 *   - Pour chaque semaine : liste des séances (jours), chaque séance ouvre la SeanceModal
 *   - Aside : LiveMetricsPanel
 */

import { useCallback, useMemo, useState } from 'react'
import { format, parseISO, addDays, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Block, Session, Set as SetRow } from '@/types/database'
import SeanceModal from '@/components/calendrier/SeanceModal'
import LiveMetricsPanel from './LiveMetricsPanel'
import { Plus } from '@/components/ui/Icon'

type SessionWithSets = Session & { sets: SetRow[] }

interface Props {
  initialBlock: Block
  initialSessions: SessionWithSets[]
  athleteId: string
}

export default function BlockEditorClient({ initialBlock, initialSessions, athleteId }: Props) {
  const [block, setBlock] = useState<Block>(initialBlock)
  const [sessions, setSessions] = useState<SessionWithSets[]>(initialSessions)
  const [activeWeek, setActiveWeek] = useState<number>(1)
  const [openSession, setOpenSession] = useState<SessionWithSets | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const totalWeeks = block.total_weeks ?? 4

  /** Sessions groupées par semaine */
  const sessionsByWeek = useMemo(() => {
    const map: Record<number, SessionWithSets[]> = {}
    for (const s of sessions) {
      const w = s.week_in_block ?? 0
      if (!w) continue
      ;(map[w] ??= []).push(s)
    }
    // tri par session_number puis date
    for (const k of Object.keys(map)) {
      map[+k].sort((a, b) => {
        const an = a.session_number ?? 0
        const bn = b.session_number ?? 0
        if (an !== bn) return an - bn
        return a.scheduled_date.localeCompare(b.scheduled_date)
      })
    }
    return map
  }, [sessions])

  const currentWeekSessions = sessionsByWeek[activeWeek] ?? []

  /* -------- recharger sessions ---------- */
  const reload = useCallback(async () => {
    const res = await fetch(`/api/blocks/${block.id}/full`)
    if (res.ok) {
      const data = await res.json()
      setBlock(data.block)
      setSessions(data.sessions)
      setRefreshKey(k => k + 1)
    }
  }, [block.id])

  /* -------- créer une nouvelle séance à une date donnée dans la semaine active -------- */
  const addSessionToDay = useCallback(
    async (weekNum: number, date: string) => {
      const sessionNumber = (sessionsByWeek[weekNum]?.length ?? 0) + 1

      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athlete_id: athleteId,
          block_id: block.id,
          scheduled_date: date,
          week_in_block: weekNum,
          session_number: sessionNumber,
          notes_coach: `Jour ${sessionNumber}`,
        }),
      })
      if (!res.ok) {
        // si la session POST n'attache pas block_id (pas dans createSessionSchema)
        // on patch après
        const fallback = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            athlete_id: athleteId,
            scheduled_date: date,
            notes_coach: `Jour ${sessionNumber}`,
          }),
        })
        if (fallback.ok) {
          const created: Session = await fallback.json()
          await fetch(`/api/sessions/${created.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              block_id: block.id,
              week_in_block: weekNum,
              session_number: sessionNumber,
            }),
          })
        }
      }
      await reload()
    },
    [athleteId, block.id, sessionsByWeek, reload],
  )


  /* -------- supprimer une séance -------- */
  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!confirm('Supprimer cette séance ?')) return
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      await reload()
    },
    [reload],
  )

  /* -------- mettre à jour les meta du bloc -------- */
  const updateBlock = useCallback(
    async (patch: Partial<Block>) => {
      const res = await fetch(`/api/blocks/${block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (res.ok) {
        const updated: Block = await res.json()
        setBlock(updated)
      }
    },
    [block.id],
  )

  /* ------------------ render ------------------ */
  return (
    <div className="space-y-4">
      {/* Header bloc */}
      <BlockHeader block={block} onUpdate={updateBlock} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-3">

          {/* Grille hebdo (Lun → Dim) avec séances par jour */}
          <WeekSessions
            weekNum={activeWeek}
            sessions={currentWeekSessions}
            onOpen={setOpenSession}
            onAdd={(date) => addSessionToDay(activeWeek, date)}
            onDelete={deleteSession}
            blockStart={block.start_date}
          />
        </div>

        {/* Live metrics */}
        <aside className="xl:sticky xl:top-4">
          <LiveMetricsPanel
            blockId={block.id}
            refreshKey={refreshKey}
            activeWeek={activeWeek}
            onSelectWeek={setActiveWeek}
            totalWeeks={totalWeeks}
          />
        </aside>
      </div>

      {openSession && (
        <SeanceModal
          session={openSession}
          onClose={() => setOpenSession(null)}
          onUpdate={reload}
          isCoach
        />
      )}
    </div>
  )
}

/* ------------------ sous-composants ------------------ */

function BlockHeader({ block, onUpdate }: { block: Block; onUpdate: (patch: Partial<Block>) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(block.name)
  const [type, setType] = useState<Block['type']>(block.type)
  const [totalWeeks, setTotalWeeks] = useState(block.total_weeks?.toString() ?? '')

  function save() {
    const patch: Partial<Block> = {
      name,
      type,
      total_weeks: totalWeeks ? parseInt(totalWeeks) : null,
    }
    onUpdate(patch)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input className="input-base sm:col-span-2" value={name} onChange={e => setName(e.target.value)} placeholder="Nom du bloc" />
          <select className="input-base" value={type} onChange={e => setType(e.target.value as Block['type'])}>
            {['Accumulation', 'Intensification', 'Réalisation', 'Deload'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input className="input-base" type="number" min={1} max={20} value={totalWeeks} onChange={e => setTotalWeeks(e.target.value)} placeholder="Semaines" />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setEditing(false)}>Annuler</button>
          <button className="btn-primary" onClick={save}>Sauvegarder</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xl font-semibold text-white">{block.name}</h1>
          <BlockTypeBadge type={block.type} />
          {block.is_taper && (
            <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-xs text-amber-300">Taper</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">
          {format(parseISO(block.start_date), 'd MMM yyyy', { locale: fr })}
          {block.total_weeks ? ` · ${block.total_weeks} semaines` : ''}
        </p>
      </div>
      <button className="btn-secondary" onClick={() => setEditing(true)}>Modifier</button>
    </div>
  )
}

function BlockTypeBadge({ type }: { type: Block['type'] }) {
  const map: Record<Block['type'], string> = {
    Accumulation: 'bg-blue-900/40 text-blue-300',
    Intensification: 'bg-purple-900/40 text-purple-300',
    Réalisation: 'bg-orange-900/40 text-orange-300',
    Deload: 'bg-zinc-800 text-zinc-300',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs ${map[type]}`}>{type}</span>
}

function WeekSessions({
  weekNum,
  sessions,
  onOpen,
  onAdd,
  onDelete,
  blockStart,
}: {
  weekNum: number
  sessions: SessionWithSets[]
  onOpen: (s: SessionWithSets) => void
  onAdd: (date: string) => void
  onDelete: (id: string) => void
  blockStart: string
}) {
  // Grille hebdo Lun → Dim : on aligne sur le lundi calendaire de la semaine où tombe wkStart
  const wkStart = addDays(parseISO(blockStart), (weekNum - 1) * 7)
  const monday = startOfWeek(wkStart, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  // Regroupe les séances par date YYYY-MM-DD
  const sessionsByDate = new Map<string, SessionWithSets[]>()
  for (const s of sessions) {
    const arr = sessionsByDate.get(s.scheduled_date) ?? []
    arr.push(s)
    sessionsByDate.set(s.scheduled_date, arr)
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="font-semibold text-white">
            Semaine {weekNum}
            {weekNum === 1 && (
              <span className="ml-2 rounded-full bg-orange-600/15 px-2 py-0.5 text-xs text-orange-300">Template</span>
            )}
          </h2>
          <p className="text-xs text-zinc-500">
            {format(monday, 'EEE d MMM', { locale: fr })} → {format(addDays(monday, 6), 'EEE d MMM', { locale: fr })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const dayName = format(day, 'EEEE', { locale: fr })
          const dayDate = format(day, 'd MMM', { locale: fr })
          const dayCellSessions = sessionsByDate.get(dateStr) ?? []
          return (
            <div
              key={dateStr}
              className="flex min-h-[150px] flex-col rounded-lg border border-zinc-800 bg-zinc-900/40"
            >
              <div className="border-b border-zinc-800 px-2 py-1.5">
                <div className="text-xs font-medium capitalize text-zinc-200">{dayName}</div>
                <div className="text-[10px] text-zinc-500">{dayDate}</div>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-1.5">
                {dayCellSessions.map(s => (
                  <DayCellSession
                    key={s.id}
                    session={s}
                    onOpen={() => onOpen(s)}
                    onDelete={() => onDelete(s.id)}
                  />
                ))}
                <button
                  onClick={() => onAdd(dateStr)}
                  className="mt-auto flex items-center justify-center gap-1 rounded-md border border-dashed border-zinc-700 bg-zinc-950/40 px-2 py-1.5 text-[11px] text-zinc-400 transition-colors hover:border-orange-500/50 hover:bg-orange-500/5 hover:text-orange-300"
                  title="Ajouter une séance"
                  aria-label={`Ajouter une séance le ${dayName} ${dayDate}`}
                >
                  <Plus className="size-3" />
                  Séance
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayCellSession({
  session,
  onOpen,
  onDelete,
}: {
  session: SessionWithSets
  onOpen: () => void
  onDelete: () => void
}) {
  const sets = session.sets ?? []
  const exos = Array.from(new Set(sets.map(s => s.exercise_name)))
  const main = exos[0] ?? `J${session.session_number ?? '?'}`

  return (
    <div className="group relative rounded-md border border-zinc-700/60 bg-zinc-900">
      <button onClick={onOpen} className="block w-full p-1.5 pr-5 text-left">
        <div className="truncate text-xs font-medium text-white">{main}</div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
          <span className="font-mono">{sets.length}s</span>
          {exos.length > 1 && <span>+{exos.length - 1}</span>}
          <span
            className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] ${
              session.status === 'completed'
                ? 'bg-emerald-900/40 text-emerald-300'
                : session.status === 'in_progress'
                ? 'bg-amber-900/40 text-amber-300'
                : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {session.status === 'completed' ? '✓' : session.status === 'in_progress' ? '⟳' : '○'}
          </span>
        </div>
      </button>
      <button
        onClick={onDelete}
        className="absolute right-0.5 top-0.5 hidden size-4 items-center justify-center rounded-full text-xs leading-none text-zinc-500 hover:bg-red-900/30 hover:text-red-300 group-hover:flex"
        title="Supprimer la séance"
        aria-label="Supprimer la séance"
      >
        ×
      </button>
    </div>
  )
}
