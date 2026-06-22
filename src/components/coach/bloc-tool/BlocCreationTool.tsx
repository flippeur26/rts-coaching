'use client'

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Block, Session, Set as SetRow } from '@/types/database'
import { guessCategory } from '@/lib/movement'
import type { MovementCategory } from '@/lib/movement'

/* ─── Types ─────────────────────────────────────────────────────────────── */

type SessionWithSets = Session & { sets: SetRow[] }

type TracerKey =
  | 'prescrit' | 'reel'
  | 'genou' | 'hanche'
  | 'push-h' | 'push-v'
  | 'pull-h' | 'pull-v'

interface TracerCfg {
  label: string
  color: string
  category?: MovementCategory
}

const TRACERS: Record<TracerKey, TracerCfg> = {
  prescrit: { label: 'Prescrit',  color: '#3b82f6' },
  reel:     { label: 'Réel',      color: '#f59e0b' },
  genou:    { label: 'Genou',     color: '#10b981', category: 'Squat' },
  hanche:   { label: 'Hanche',    color: '#8b5cf6', category: 'Hinge' },
  'push-h': { label: 'Push H.',   color: '#ef4444', category: 'Horizontal Push' },
  'push-v': { label: 'Push V.',   color: '#f97316', category: 'Vertical Push' },
  'pull-h': { label: 'Pull H.',   color: '#06b6d4', category: 'Horizontal Pull' },
  'pull-v': { label: 'Pull V.',   color: '#ec4899', category: 'Vertical Pull' },
}

const TRACER_KEYS = Object.keys(TRACERS) as TracerKey[]

interface DayData {
  date: Date
  dateStr: string
  sessions: SessionWithSets[]
  raw: Record<TracerKey, number>
  norm: Record<TracerKey, number> // filled after normalization
}

interface ProgConfig {
  chargeKg: number
  chargeUnit: 'kg' | '%'
  reps: number
  series: number
  rom: 'maintenu' | '+' | '−'
  rpe: number
  rpeMode: 'fixe' | 'range'
}

const DEFAULT_PROG: ProgConfig = {
  chargeKg: 2.5, chargeUnit: 'kg', reps: 0,
  series: 0, rom: 'maintenu', rpe: 7, rpeMode: 'fixe',
}

interface Popup {
  setId: string
  sessionId: string
  exoName: string
  serieNum: number
  config: ProgConfig
}

interface Props {
  initialBlock: Block
  initialSessions: SessionWithSets[]
  athleteId: string
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const ton = (w: number | null, r: number | null) => (w ?? 0) * (r ?? 0)

function buildDayData(
  sessions: SessionWithSets[],
  blockStart: string,
  weekNum: number,
): DayData[] {
  const wkStart = addDays(parseISO(blockStart), (weekNum - 1) * 7)
  const monday = startOfWeek(wkStart, { weekStartsOn: 1 })

  const days: DayData[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    return {
      date,
      dateStr: format(date, 'yyyy-MM-dd'),
      sessions: [],
      raw: { prescrit: 0, reel: 0, genou: 0, hanche: 0, 'push-h': 0, 'push-v': 0, 'pull-h': 0, 'pull-v': 0 },
      norm: { prescrit: 0, reel: 0, genou: 0, hanche: 0, 'push-h': 0, 'push-v': 0, 'pull-h': 0, 'pull-v': 0 },
    }
  })

  for (const sess of sessions) {
    const idx = days.findIndex(d => d.dateStr === sess.scheduled_date)
    if (idx < 0) continue
    days[idx].sessions.push(sess)
    for (const s of sess.sets ?? []) {
      const cat = guessCategory(s.exercise_name)
      days[idx].raw.prescrit += ton(s.weight_prescribed_kg, s.reps_prescribed)
      days[idx].raw.reel     += ton(s.weight_actual_kg,     s.reps_actual)
      const patTon = ton(
        s.weight_actual_kg ?? s.weight_prescribed_kg,
        s.reps_actual ?? s.reps_prescribed,
      )
      if (cat === 'Squat')           days[idx].raw.genou   += patTon
      if (cat === 'Hinge')           days[idx].raw.hanche  += patTon
      if (cat === 'Horizontal Push') days[idx].raw['push-h'] += patTon
      if (cat === 'Vertical Push')   days[idx].raw['push-v'] += patTon
      if (cat === 'Horizontal Pull') days[idx].raw['pull-h'] += patTon
      if (cat === 'Vertical Pull')   days[idx].raw['pull-v'] += patTon
    }
  }

  // Normalize each tracer to [0, 1]
  for (const t of TRACER_KEYS) {
    const max = Math.max(...days.map(d => d.raw[t]), 1)
    for (const d of days) d.norm[t] = d.raw[t] / max
  }

  return days
}

function groupByExo(sets: SetRow[]): Map<string, SetRow[]> {
  const map = new Map<string, SetRow[]>()
  for (const s of sets) {
    const arr = map.get(s.exercise_name) ?? []
    arr.push(s)
    map.set(s.exercise_name, arr)
  }
  for (const [, arr] of map) arr.sort((a, b) => a.set_number - b.set_number)
  return map
}

function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1][0] + pts[i][0]) / 2
    d += ` C${mx},${pts[i - 1][1]} ${mx},${pts[i][1]} ${pts[i][0]},${pts[i][1]}`
  }
  return d
}

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const GRAPH_H = 140

function catColor(cat: MovementCategory | undefined): string {
  const map: Partial<Record<MovementCategory, string>> = {
    'Squat': 'var(--mvmt-squat)',
    'Hinge': 'var(--mvmt-hinge)',
    'Horizontal Push': 'var(--mvmt-hpush)',
    'Vertical Push': 'var(--mvmt-vpush)',
    'Horizontal Pull': 'var(--mvmt-hpull)',
    'Vertical Pull': 'var(--mvmt-vpull)',
    'Accessoire': 'var(--mvmt-acc)',
  }
  return cat ? (map[cat] ?? '#64748b') : '#64748b'
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */

export default function BlocCreationTool({ initialBlock, initialSessions, athleteId }: Props) {
  const [block, setBlock] = useState(initialBlock)
  const [sessions, setSessions] = useState(initialSessions)
  const [activeWeek, setActiveWeek] = useState(1)
  const [activeTracers, setActiveTracers] = useState<Set<TracerKey>>(
    new Set<TracerKey>(['prescrit', 'reel', 'genou', 'hanche', 'pull-h']),
  )
  const [popup, setPopup] = useState<Popup | null>(null)
  // Local override: setId → partial patch (not yet saved)
  const [pending, setPending] = useState<Record<string, Partial<SetRow>>>({})
  const gridRef = useRef<HTMLDivElement>(null)
  const [gridWidth, setGridWidth] = useState(0)
  const [saving, setSaving] = useState<Set<string>>(new Set())

  const totalWeeks = block.total_weeks ?? 4

  /* Reload data from server */
  const reload = useCallback(async () => {
    const res = await fetch(`/api/blocks/${block.id}/full`)
    if (!res.ok) return
    const data = await res.json()
    setBlock(data.block)
    setSessions(data.sessions ?? [])
  }, [block.id])

  /* Measure grid width for SVG alignment */
  useEffect(() => {
    if (!gridRef.current) return
    const obs = new ResizeObserver(([e]) => setGridWidth(e.contentRect.width))
    obs.observe(gridRef.current)
    setGridWidth(gridRef.current.getBoundingClientRect().width)
    return () => obs.disconnect()
  }, [])

  /* Sessions for active week */
  const weekSessions = useMemo(() => {
    return sessions.filter(s => s.week_in_block === activeWeek)
  }, [sessions, activeWeek])

  /* Day data (graph + programme) */
  const dayData = useMemo(
    () => buildDayData(weekSessions, block.start_date, activeWeek),
    [weekSessions, block.start_date, activeWeek],
  )

  /* All sessions by week (for progression table) */
  const sessionsByWeek = useMemo(() => {
    const map: Record<number, SessionWithSets[]> = {}
    for (const s of sessions) {
      const w = s.week_in_block
      if (!w) continue
      ;(map[w] ??= []).push(s)
    }
    return map
  }, [sessions])

  /* Graph: column center x */
  const colCenterX = useCallback(
    (i: number) => (i + 0.5) * (gridWidth / 7),
    [gridWidth],
  )
  /* Graph: value → Y position */
  const valY = useCallback(
    (v: number) => GRAPH_H * (1 - v * 0.78 - 0.10),
    [],
  )

  /* Toggle tracer */
  const toggleTracer = useCallback((t: TracerKey) => {
    setActiveTracers(prev => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }, [])

  /* Save set field */
  const saveSetField = useCallback(async (setId: string, patch: Partial<SetRow>) => {
    setSaving(prev => new Set(prev).add(setId))
    try {
      await fetch(`/api/sets/${setId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } finally {
      setSaving(prev => { const n = new Set(prev); n.delete(setId); return n })
    }
  }, [])

  /* Add a new set to a session */
  const addSet = useCallback(async (sessionId: string, exoName: string, setNumber: number) => {
    await fetch(`/api/sessions/${sessionId}/sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise_name: exoName, set_number: setNumber }),
    })
    await reload()
  }, [reload])

  /* Delete a set */
  const deleteSet = useCallback(async (setId: string) => {
    await fetch(`/api/sets/${setId}`, { method: 'DELETE' })
    await reload()
  }, [reload])

  /* Add a new exercise to a day — creates the session first if the day is a rest day */
  const addExercise = useCallback(async (day: DayData, exoName: string) => {
    let sessionId = day.sessions[0]?.id
    if (!sessionId) {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athlete_id: athleteId,
          block_id: block.id,
          scheduled_date: day.dateStr,
          week_in_block: activeWeek,
          session_number: 1,
          notes_coach: `Jour ${activeWeek}`,
        }),
      })
      if (!res.ok) return
      const created = await res.json()
      sessionId = created.id
    }
    await fetch(`/api/sessions/${sessionId}/sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise_name: exoName, set_number: 1 }),
    })
    await reload()
  }, [athleteId, block.id, activeWeek, reload])

  /* Helpers for local pending state */
  const getSetVal = useCallback(
    <K extends keyof SetRow>(set: SetRow, field: K): SetRow[K] =>
      (pending[set.id]?.[field] as SetRow[K]) ?? set[field],
    [pending],
  )
  const setPending_ = useCallback(
    (setId: string, patch: Partial<SetRow>) =>
      setPending(prev => ({ ...prev, [setId]: { ...(prev[setId] ?? {}), ...patch } })),
    [],
  )

  /* ── Render ── */
  return (
    <div className="flex flex-col gap-0 rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950">

      {/* ── WEEK HEADER ── */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-2.5">
        <button
          disabled={activeWeek <= 1}
          onClick={() => setActiveWeek(w => Math.max(1, w - 1))}
          className="flex size-7 items-center justify-center rounded border border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-blue-500 hover:text-blue-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
        >
          ←
        </button>
        <div className="text-center">
          <span className="text-sm font-bold text-white">{block.name}</span>
          <span className="mx-2 text-zinc-600">·</span>
          <span className="text-sm font-semibold text-zinc-300">Semaine {activeWeek}</span>
          {activeWeek === 1 && (
            <span className="ml-2 rounded-full bg-orange-600/15 px-2 py-0.5 text-[10px] text-orange-300">Template</span>
          )}
          <p className="mt-0.5 text-[10px] text-zinc-500">
            {dayData[0] && format(dayData[0].date, 'd MMM', { locale: fr })}
            {' → '}
            {dayData[6] && format(dayData[6].date, 'd MMM yyyy', { locale: fr })}
          </p>
        </div>
        <button
          disabled={activeWeek >= totalWeeks}
          onClick={() => setActiveWeek(w => Math.min(totalWeeks, w + 1))}
          className="flex size-7 items-center justify-center rounded border border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-blue-500 hover:text-blue-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
        >
          →
        </button>
      </div>

      {/* ── SÉLECTEUR DE SEMAINE (accès direct) ── */}
      <div className="flex items-center justify-center gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
        {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(w => (
          <button
            key={w}
            onClick={() => setActiveWeek(w)}
            className={`flex-shrink-0 rounded px-2.5 py-1 text-[10px] font-bold transition-colors ${
              w === activeWeek
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300'
            }`}
          >
            S{w}
          </button>
        ))}
      </div>

      {/* ── FILTER BAR ── */}
      <FilterBar activeTracers={activeTracers} onToggle={toggleTracer} />

      {/* ── MAIN GRID : graph + programme (même conteneur, même 7 colonnes) ── */}
      <div ref={gridRef} className="relative grid gap-0" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>

        {/* GRAPH ROW : 7 cells */}
        {dayData.map((day, i) => (
          <div
            key={i}
            style={{
              height: GRAPH_H,
              background: day.sessions.length === 0 ? '#06080f' : '#0e1320',
              borderRight: i < 6 ? '1px solid #1f2b42' : undefined,
              position: 'relative',
            }}
          >
            {/* Zebra grid lines */}
            {[1, 2, 3].map(l => (
              <div
                key={l}
                style={{
                  position: 'absolute', left: 0, right: 0,
                  top: `${(l / 4) * 100}%`,
                  borderTop: '1px solid #131a28',
                }}
              />
            ))}
            {/* Rest indicator */}
            {day.sessions.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-[9px] text-zinc-700">
                repos
              </div>
            )}
          </div>
        ))}

        {/* SVG OVERLAY — couvre les 7 cellules graphique */}
        {gridWidth > 0 && (
          <svg
            style={{
              position: 'absolute', top: 0, left: 0,
              width: gridWidth, height: GRAPH_H,
              pointerEvents: 'none', zIndex: 5,
            }}
          >
            <defs>
              {TRACER_KEYS.map(t => (
                <linearGradient key={t} id={`g-${t}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={TRACERS[t].color} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={TRACERS[t].color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            {/* Column separators (mirrors CSS borders) */}
            {Array.from({ length: 6 }, (_, i) => (
              <line key={i}
                x1={(i + 1) * (gridWidth / 7)} y1={0}
                x2={(i + 1) * (gridWidth / 7)} y2={GRAPH_H}
                stroke="#1f2b42" strokeWidth={1}
              />
            ))}

            {/* One group per active tracer */}
            {TRACER_KEYS.filter(t => activeTracers.has(t)).map(t => {
              const pts = dayData
                .map((d, i) => ({ x: colCenterX(i), y: valY(d.norm[t]), v: d.norm[t] }))
                .filter(p => p.v > 0)
              if (pts.length < 1) return null
              const path = smoothPath(pts.map(p => [p.x, p.y]))
              const { color } = TRACERS[t]
              return (
                <g key={t}>
                  {pts.length >= 2 && (
                    <path
                      d={`${path} L${pts[pts.length - 1].x},${GRAPH_H} L${pts[0].x},${GRAPH_H} Z`}
                      fill={`url(#g-${t})`}
                    />
                  )}
                  {pts.length >= 2 && (
                    <path d={path} fill="none" stroke={color} strokeWidth={2}
                      strokeLinecap="round" strokeLinejoin="round" />
                  )}
                  {pts.map((p, j) => (
                    <circle key={j} cx={p.x} cy={p.y} r={4}
                      fill={color} stroke="#0e1320" strokeWidth={2} />
                  ))}
                </g>
              )
            })}
          </svg>
        )}

        {/* LÉGENDE GRAPHIQUE (span 7) */}
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-t border-zinc-800 bg-zinc-900/70 px-3 py-1.5"
          style={{ gridColumn: '1 / -1' }}
        >
          {TRACER_KEYS.filter(t => activeTracers.has(t)).map(t => (
            <span key={t} className="flex items-center gap-1.5 text-[9px] text-zinc-400">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: TRACERS[t].color }} />
              <span className="inline-block size-1.5 rounded-full" style={{ background: TRACERS[t].color }} />
              {TRACERS[t].label}
            </span>
          ))}
          {[...activeTracers].length === 0 && (
            <span className="text-[9px] text-zinc-600">Aucun traceur actif</span>
          )}
        </div>

        {/* EN-TÊTES JOURS (dans le même grid → alignés avec le graphique) */}
        {dayData.map((day, i) => {
          const isToday = day.dateStr === format(new Date(), 'yyyy-MM-dd')
          return (
            <div
              key={i}
              className="border-b border-zinc-800 bg-zinc-900 py-1.5 text-center"
              style={{ borderRight: i < 6 ? '1px solid #1f2b42' : undefined }}
            >
              <div className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? 'text-blue-400' : 'text-zinc-500'}`}>
                {DAY_NAMES[i]}
              </div>
              <div className={`text-[9px] ${isToday ? 'text-blue-500/70' : 'text-zinc-700'}`}>
                {format(day.date, 'd MMM', { locale: fr })}
              </div>
              {isToday && (
                <div className="mx-auto mt-0.5 h-0.5 w-4 rounded bg-blue-500" />
              )}
            </div>
          )
        })}

        {/* COLONNES PROGRAMME (dans le même grid) */}
        {dayData.map((day, i) => (
          <DayColumn
            key={i}
            day={day}
            isLast={i === 6}
            getSetVal={getSetVal}
            onPending={setPending_}
            onSave={saveSetField}
            onAddSet={addSet}
            onDeleteSet={deleteSet}
            onOpenPopup={setPopup}
            saving={saving}
            onAddExercise={addExercise}
          />
        ))}
      </div>

      {/* ── PROGRESSION TABLE ── */}
      <ProgTable
        block={block}
        sessionsByWeek={sessionsByWeek}
        activeWeek={activeWeek}
        totalWeeks={totalWeeks}
      />

      {/* ── POPUP ── */}
      {popup && (
        <ProgOptionsPopup
          popup={popup}
          onClose={() => setPopup(null)}
          onSave={(cfg) => {
            // TODO: persist to block_progression_config
            setPopup(null)
          }}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   FILTER BAR
═══════════════════════════════════════════════════════════════════════════ */

function FilterBar({
  activeTracers, onToggle,
}: { activeTracers: Set<TracerKey>; onToggle: (t: TracerKey) => void }) {
  const dataTracers: TracerKey[] = ['prescrit', 'reel']
  const patternTracers: TracerKey[] = ['genou', 'hanche', 'push-h', 'push-v', 'pull-h', 'pull-v']
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-800 bg-zinc-900/50 px-3 py-2">
      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">Traceurs</span>
      {dataTracers.map(t => (
        <Chip key={t} tracer={t} active={activeTracers.has(t)} onToggle={onToggle} />
      ))}
      <div className="h-3 w-px bg-zinc-700" />
      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">Patterns</span>
      {patternTracers.map(t => (
        <Chip key={t} tracer={t} active={activeTracers.has(t)} onToggle={onToggle} />
      ))}
    </div>
  )
}

function Chip({ tracer, active, onToggle }: {
  tracer: TracerKey; active: boolean; onToggle: (t: TracerKey) => void
}) {
  const { label, color } = TRACERS[tracer]
  return (
    <button
      onClick={() => onToggle(tracer)}
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition-all"
      style={{
        borderColor: active ? color + '88' : '#263249',
        color: active ? color : '#445568',
        background: active ? color + '18' : 'transparent',
        opacity: active ? 1 : 0.5,
      }}
    >
      <span className="inline-block size-1.5 rounded-full" style={{ background: color }} />
      {label}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   DAY COLUMN
═══════════════════════════════════════════════════════════════════════════ */

function DayColumn({
  day, isLast, getSetVal, onPending, onSave, onAddSet, onDeleteSet, onOpenPopup, saving, onAddExercise,
}: {
  day: DayData
  isLast: boolean
  getSetVal: <K extends keyof SetRow>(set: SetRow, field: K) => SetRow[K]
  onPending: (setId: string, patch: Partial<SetRow>) => void
  onSave: (setId: string, patch: Partial<SetRow>) => void
  onAddSet: (sessionId: string, exoName: string, setNumber: number) => void
  onDeleteSet: (setId: string) => void
  onOpenPopup: (p: Popup) => void
  saving: Set<string>
  onAddExercise: (day: DayData, exoName: string) => void
}) {
  const isRest = day.sessions.length === 0
  return (
    <div
      className={`min-h-[200px] ${isRest ? 'bg-zinc-950/50' : 'bg-zinc-900/30'}`}
      style={{ borderRight: isLast ? undefined : '1px solid #1f2b42' }}
    >
      {isRest ? (
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 p-1.5 text-zinc-700">
          <span className="text-xl opacity-30">🌙</span>
          <span className="text-[9px]">Repos</span>
          <div className="mt-1 w-full">
            <AddExoButton onAdd={name => onAddExercise(day, name)} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 p-1.5">
          {day.sessions.map(sess => {
            const exoMap = groupByExo(sess.sets ?? [])
            return (
              <div key={sess.id} className="flex flex-col gap-1">
                {[...exoMap.entries()].map(([exoName, sets]) => (
                  <ExoBlock
                    key={exoName}
                    exoName={exoName}
                    sets={sets}
                    sessionId={sess.id}
                    getSetVal={getSetVal}
                    onPending={onPending}
                    onSave={onSave}
                    onAddSet={onAddSet}
                    onDeleteSet={onDeleteSet}
                    onOpenPopup={onOpenPopup}
                    saving={saving}
                  />
                ))}
              </div>
            )
          })}
          <AddExoButton onAdd={name => onAddExercise(day, name)} />
        </div>
      )}
    </div>
  )
}

/* ─── Add exercise inline form ─────────────────────────────────────────── */

function AddExoButton({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded border border-dashed border-zinc-700/60 py-1 text-[9px] font-semibold text-zinc-500 transition-colors hover:border-emerald-500/50 hover:text-emerald-400"
      >
        + Exercice
      </button>
    )
  }

  const submit = () => {
    const trimmed = name.trim()
    if (trimmed) onAdd(trimmed)
    setName('')
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') { setOpen(false); setName('') }
        }}
        placeholder="Nom de l'exercice…"
        className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-[9px] text-white focus:border-emerald-500 focus:outline-none"
      />
      <button
        onClick={submit}
        className="flex-shrink-0 rounded bg-emerald-600 px-1.5 py-1 text-[9px] font-bold text-white hover:bg-emerald-500"
      >
        ✓
      </button>
      <button
        onClick={() => { setOpen(false); setName('') }}
        className="flex-shrink-0 rounded border border-zinc-700 px-1.5 py-1 text-[9px] text-zinc-400 hover:text-white"
      >
        ✕
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXERCISE BLOCK
═══════════════════════════════════════════════════════════════════════════ */

function ExoBlock({
  exoName, sets, sessionId,
  getSetVal, onPending, onSave,
  onAddSet, onDeleteSet, onOpenPopup, saving,
}: {
  exoName: string
  sets: SetRow[]
  sessionId: string
  getSetVal: <K extends keyof SetRow>(set: SetRow, field: K) => SetRow[K]
  onPending: (setId: string, patch: Partial<SetRow>) => void
  onSave: (setId: string, patch: Partial<SetRow>) => void
  onAddSet: (sid: string, exo: string, num: number) => void
  onDeleteSet: (setId: string) => void
  onOpenPopup: (p: Popup) => void
  saving: Set<string>
}) {
  const cat = guessCategory(exoName)
  const color = catColor(cat)

  return (
    <div
      className="overflow-hidden rounded-md border"
      style={{ borderColor: color + '33', background: color + '08' }}
    >
      {/* Exercise header */}
      <div
        className="flex items-center gap-1.5 px-1.5 py-1"
        style={{ borderBottom: `1px solid ${color}22` }}
      >
        <div
          className="w-1 self-stretch rounded-full flex-shrink-0"
          style={{ background: color }}
        />
        <span
          className="min-w-0 flex-1 truncate text-[9px] font-bold leading-tight"
          style={{ color }}
        >
          {exoName}
        </span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-0.5 px-1 pt-1 pb-0.5">
        <div className="w-3.5 flex-shrink-0" />
        {/* Prescrit */}
        <div className="flex flex-1 gap-0.5">
          <span className="flex-1 text-center text-[7px] font-semibold text-blue-400/60">ch</span>
          <span className="flex-1 text-center text-[7px] font-semibold text-blue-400/60">rep</span>
          <span className="flex-1 text-center text-[7px] font-semibold text-blue-400/60">RPE</span>
        </div>
        <span className="w-3 flex-shrink-0 text-center text-[7px] text-zinc-700">vs</span>
        {/* Réel */}
        <div className="flex flex-1 gap-0.5">
          <span className="flex-1 text-center text-[7px] font-semibold text-amber-400/60">ch</span>
          <span className="flex-1 text-center text-[7px] font-semibold text-amber-400/60">rep</span>
          <span className="flex-1 text-center text-[7px] font-semibold text-amber-400/60">RPE</span>
        </div>
        <div className="w-4 flex-shrink-0" />
      </div>

      {/* Series */}
      <div className="flex flex-col gap-0.5 px-1 pb-1">
        {sets.map(set => (
          <SerieRow
            key={set.id}
            set={set}
            getSetVal={getSetVal}
            onPending={onPending}
            onSave={onSave}
            onDelete={() => onDeleteSet(set.id)}
            onOptions={() =>
              onOpenPopup({
                setId: set.id,
                sessionId,
                exoName,
                serieNum: set.set_number,
                config: DEFAULT_PROG,
              })
            }
            isSaving={saving.has(set.id)}
          />
        ))}

        {/* Add serie */}
        <button
          className="mt-0.5 w-full rounded border border-dashed border-zinc-700/50 py-0.5 text-[8px] text-zinc-600 transition-colors hover:border-blue-500/40 hover:text-blue-400"
          onClick={() => onAddSet(sessionId, exoName, (sets[sets.length - 1]?.set_number ?? 0) + 1)}
        >
          + série
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SERIE ROW
═══════════════════════════════════════════════════════════════════════════ */

function SerieRow({
  set, getSetVal, onPending, onSave, onDelete, onOptions, isSaving,
}: {
  set: SetRow
  getSetVal: <K extends keyof SetRow>(set: SetRow, field: K) => SetRow[K]
  onPending: (setId: string, patch: Partial<SetRow>) => void
  onSave: (setId: string, patch: Partial<SetRow>) => void
  onDelete: () => void
  onOptions: () => void
  isSaving: boolean
}) {
  const hasActual = !!(set.weight_actual_kg || set.reps_actual || set.rpe_actual)

  return (
    <div
      className={`group flex items-center gap-0.5 rounded px-0.5 py-0.5 transition-colors hover:bg-zinc-800/60 ${isSaving ? 'opacity-60' : ''}`}
    >
      <span className="w-3.5 flex-shrink-0 text-center text-[8px] font-bold text-zinc-600">
        S{set.set_number}
      </span>

      {/* Prescrit */}
      <div className="flex flex-1 gap-0.5">
        <NumInput
          value={getSetVal(set, 'weight_prescribed_kg') as number | null}
          className="text-blue-300"
          step={2.5}
          onBlur={v => onSave(set.id, { weight_prescribed_kg: v })}
          onChange={v => onPending(set.id, { weight_prescribed_kg: v })}
        />
        <NumInput
          value={getSetVal(set, 'reps_prescribed') as number | null}
          className="text-blue-300"
          step={1}
          onBlur={v => onSave(set.id, { reps_prescribed: v !== null ? Math.round(v) : null })}
          onChange={v => onPending(set.id, { reps_prescribed: v !== null ? Math.round(v) : null })}
        />
        <NumInput
          value={getSetVal(set, 'rpe_prescribed') as number | null}
          className="text-blue-300"
          step={0.5}
          onBlur={v => onSave(set.id, { rpe_prescribed: v })}
          onChange={v => onPending(set.id, { rpe_prescribed: v })}
        />
      </div>

      <span className="w-3 flex-shrink-0 text-center text-[7px] text-zinc-700">vs</span>

      {/* Réel */}
      <div className="flex flex-1 gap-0.5">
        <NumInput
          value={getSetVal(set, 'weight_actual_kg') as number | null}
          className={hasActual ? 'text-amber-300' : 'text-zinc-600'}
          step={2.5}
          placeholder="—"
          onBlur={v => onSave(set.id, { weight_actual_kg: v })}
          onChange={v => onPending(set.id, { weight_actual_kg: v })}
        />
        <NumInput
          value={getSetVal(set, 'reps_actual') as number | null}
          className={hasActual ? 'text-amber-300' : 'text-zinc-600'}
          step={1}
          placeholder="—"
          onBlur={v => onSave(set.id, { reps_actual: v !== null ? Math.round(v) : null })}
          onChange={v => onPending(set.id, { reps_actual: v !== null ? Math.round(v) : null })}
        />
        <NumInput
          value={getSetVal(set, 'rpe_actual') as number | null}
          className={hasActual ? 'text-amber-300' : 'text-zinc-600'}
          step={0.5}
          placeholder="—"
          onBlur={v => onSave(set.id, { rpe_actual: v })}
          onChange={v => onPending(set.id, { rpe_actual: v })}
        />
      </div>

      {/* Options & delete */}
      <button
        onClick={onOptions}
        title="Critères progression N+1"
        className="w-4 flex-shrink-0 text-center text-[11px] text-zinc-600 transition-colors hover:text-zinc-300"
      >
        ⋯
      </button>
      <button
        onClick={onDelete}
        title="Supprimer la série"
        className="hidden w-3 flex-shrink-0 text-center text-[9px] text-zinc-700 transition-colors hover:text-red-400 group-hover:block"
      >
        ×
      </button>
    </div>
  )
}

/* ─── NumInput ─────────────────────────────────────────────────────────── */

function NumInput({
  value, className = '', step = 1, placeholder = '',
  onBlur, onChange,
}: {
  value: number | null
  className?: string
  step?: number
  placeholder?: string
  onBlur: (v: number | null) => void
  onChange: (v: number | null) => void
}) {
  const [local, setLocal] = useState(value != null ? String(value) : '')

  // Sync when external value changes (e.g. after reload)
  useEffect(() => {
    setLocal(value != null ? String(value) : '')
  }, [value])

  return (
    <input
      type="number"
      step={step}
      value={local}
      placeholder={placeholder}
      className={`flex-1 min-w-0 rounded border border-transparent bg-transparent px-0.5 py-0.5 text-center text-[9px] transition-colors focus:border-zinc-600 focus:bg-zinc-950/80 focus:outline-none ${className}`}
      onChange={e => {
        setLocal(e.target.value)
        const n = parseFloat(e.target.value)
        onChange(isNaN(n) ? null : n)
      }}
      onBlur={() => {
        const n = parseFloat(local)
        onBlur(isNaN(n) ? null : n)
      }}
    />
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   POPUP PROGRESSION N+1
═══════════════════════════════════════════════════════════════════════════ */

function ProgOptionsPopup({
  popup, onClose, onSave,
}: {
  popup: Popup
  onClose: () => void
  onSave: (cfg: ProgConfig) => void
}) {
  const [cfg, setCfg] = useState<ProgConfig>(popup.config)
  const upd = <K extends keyof ProgConfig>(k: K, v: ProgConfig[K]) =>
    setCfg(prev => ({ ...prev, [k]: v }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-72 rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-sm font-bold text-white">
              {popup.exoName} · Série {popup.serieNum}
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-500">
              Critères de progression — Semaine N+1
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex size-5 items-center justify-center rounded border border-zinc-700 text-xs text-zinc-400 hover:border-zinc-500 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Section: Progression */}
        <div className="mb-3">
          <div className="mb-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-zinc-600">
            Progression N+1
            <div className="h-px flex-1 bg-zinc-800" />
          </div>
          <div className="space-y-2">
            <PopRow label="Charge">
              <input
                type="number" step={0.5} value={cfg.chargeKg}
                onChange={e => upd('chargeKg', parseFloat(e.target.value) || 0)}
                className="w-14 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-center text-xs text-white focus:border-blue-500 focus:outline-none"
              />
              <select
                value={cfg.chargeUnit}
                onChange={e => upd('chargeUnit', e.target.value as 'kg' | '%')}
                className="rounded border border-zinc-700 bg-zinc-800 px-1 py-1 text-xs text-zinc-300 focus:outline-none"
              >
                <option value="kg">kg</option>
                <option value="%">%</option>
              </select>
            </PopRow>
            <PopRow label="Répétitions">
              <input
                type="number" step={1} value={cfg.reps}
                onChange={e => upd('reps', parseInt(e.target.value) || 0)}
                className="w-14 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-center text-xs text-white focus:border-blue-500 focus:outline-none"
              />
            </PopRow>
            <PopRow label="Séries">
              <input
                type="number" step={1} value={cfg.series}
                onChange={e => upd('series', parseInt(e.target.value) || 0)}
                className="w-14 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-center text-xs text-white focus:border-blue-500 focus:outline-none"
              />
            </PopRow>
            <PopRow label="ROM">
              <select
                value={cfg.rom}
                onChange={e => upd('rom', e.target.value as ProgConfig['rom'])}
                className="rounded border border-zinc-700 bg-zinc-800 px-1 py-1 text-xs text-zinc-300 focus:outline-none"
              >
                <option value="maintenu">maintenu</option>
                <option value="+">+</option>
                <option value="−">−</option>
              </select>
            </PopRow>
            <PopRow label="RPE cible">
              <input
                type="number" step={0.5} min={5} max={10} value={cfg.rpe}
                onChange={e => upd('rpe', parseFloat(e.target.value) || 7)}
                className="w-14 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-center text-xs text-white focus:border-blue-500 focus:outline-none"
              />
              <select
                value={cfg.rpeMode}
                onChange={e => upd('rpeMode', e.target.value as ProgConfig['rpeMode'])}
                className="rounded border border-zinc-700 bg-zinc-800 px-1 py-1 text-xs text-zinc-300 focus:outline-none"
              >
                <option value="fixe">fixe</option>
                <option value="range">range</option>
              </select>
            </PopRow>
          </div>
        </div>

        {/* Section: Copier */}
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-zinc-600">
            Copier vers séries suivantes
            <div className="h-px flex-1 bg-zinc-800" />
          </div>
          <button className="mb-1.5 flex w-full items-center gap-2 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:border-blue-500/50 hover:text-blue-300">
            <span>📋</span> Avec écrasement
          </button>
          <button className="flex w-full items-center gap-2 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:border-blue-500/50 hover:text-blue-300">
            <span>📄</span> Sans écrasement
          </button>
        </div>

        {/* Footer */}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded border border-zinc-700 py-1.5 text-xs text-zinc-400 transition-colors hover:text-white">
            Annuler
          </button>
          <button
            onClick={() => onSave(cfg)}
            className="flex-1 rounded bg-blue-600 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-500"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

function PopRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-xs text-zinc-400">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROGRESSION TABLE — toutes les semaines du bloc
═══════════════════════════════════════════════════════════════════════════ */

function ProgTable({
  block, sessionsByWeek, activeWeek, totalWeeks,
}: {
  block: Block
  sessionsByWeek: Record<number, SessionWithSets[]>
  activeWeek: number
  totalWeeks: number
}) {
  // Collect all exercise names across the bloc
  const allExos = useMemo(() => {
    const names = new Set<string>()
    for (const sessions of Object.values(sessionsByWeek)) {
      for (const s of sessions) {
        for (const set of s.sets ?? []) names.add(set.exercise_name)
      }
    }
    return [...names]
  }, [sessionsByWeek])

  if (allExos.length === 0) return null

  // For each exo × week → top prescribed set + best actual set
  function getWeekSummary(exo: string, week: number): {
    pWeight: number | null; pReps: number | null; pRpe: number | null
    aWeight: number | null; aReps: number | null; aRpe: number | null
    delta: number | null; deltaPct: number | null
  } {
    const sessions = sessionsByWeek[week] ?? []
    const sets = sessions.flatMap(s => s.sets ?? []).filter(s => s.exercise_name === exo)
    if (sets.length === 0) {
      return {
        pWeight: null, pReps: null, pRpe: null,
        aWeight: null, aReps: null, aRpe: null,
        delta: null, deltaPct: null,
      }
    }
    // Top set = highest prescribed weight
    const top = sets.reduce((best, s) => (s.weight_prescribed_kg ?? 0) > (best.weight_prescribed_kg ?? 0) ? s : best, sets[0])
    const prevSets = (sessionsByWeek[week - 1] ?? []).flatMap(s => s.sets ?? []).filter(s => s.exercise_name === exo)
    const prevTop = prevSets.length > 0 ? prevSets.reduce((b, s) => (s.weight_prescribed_kg ?? 0) > (b.weight_prescribed_kg ?? 0) ? s : b, prevSets[0]) : null
    const delta = prevTop && top.weight_prescribed_kg != null && prevTop.weight_prescribed_kg != null
      ? top.weight_prescribed_kg - prevTop.weight_prescribed_kg
      : null
    const deltaPct = delta != null && prevTop?.weight_prescribed_kg
      ? (delta / prevTop.weight_prescribed_kg) * 100
      : null
    return {
      pWeight: top.weight_prescribed_kg,
      pReps: top.reps_prescribed,
      pRpe: top.rpe_prescribed,
      aWeight: top.weight_actual_kg,
      aReps: top.reps_actual,
      aRpe: top.rpe_actual,
      delta,
      deltaPct,
    }
  }

  const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1)

  return (
    <div className="border-t border-zinc-800">
      <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900/60 px-4 py-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
          Progression du bloc
        </span>
        <span className="rounded-full bg-blue-900/30 px-2 py-0.5 text-[8px] font-bold text-blue-400 border border-blue-900/50">
          {block.name} · {totalWeeks} semaines
        </span>
        <span className="ml-auto flex items-center gap-2 text-[8px] text-zinc-600">
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-blue-400" /> prescrit</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-400" /> réel</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[9px]">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="sticky left-0 z-10 w-28 bg-zinc-950 px-3 py-2 text-left font-bold uppercase tracking-wide text-zinc-600">
                Exercice
              </th>
              {weeks.map(w => {
                const isCurrent = w === activeWeek
                const isPlanned = w > activeWeek
                return (
                  <th key={w} className="px-2 py-2 text-center font-bold uppercase tracking-wide"
                    style={{
                      borderLeft: '1px solid #1f2b42',
                      borderBottom: isCurrent ? '2px solid #3b82f6' : undefined,
                    }}
                  >
                    <div className={isCurrent ? 'text-blue-400' : 'text-zinc-600'}>
                      S{w}
                      {isCurrent && (
                        <span className="ml-1 rounded-full bg-blue-900/30 px-1 py-0.5 text-[7px] text-blue-400">
                          ←
                        </span>
                      )}
                    </div>
                    {isPlanned && (
                      <div className="text-[7px] italic text-zinc-700">planifié</div>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {allExos.map(exo => {
              const cat = guessCategory(exo)
              const color = catColor(cat)
              return (
                <tr key={exo} className="group border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                  <td className="sticky left-0 z-10 bg-zinc-950 px-3 py-2 transition-colors group-hover:bg-zinc-900">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-0.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="truncate font-semibold text-zinc-300" style={{ maxWidth: 90 }}>
                        {exo}
                      </span>
                    </div>
                  </td>
                  {weeks.map(w => {
                    const s = getWeekSummary(exo, w)
                    const isCurrent = w === activeWeek
                    const isPast = w < activeWeek
                    const isEmpty = s.pWeight === null
                    return (
                      <td
                        key={w}
                        className={`px-2 py-2 align-top ${isCurrent ? 'bg-blue-900/10' : ''}`}
                        style={{ borderLeft: '1px solid #1f2b42' }}
                      >
                        {isEmpty ? (
                          <span className="text-zinc-800">—</span>
                        ) : (
                          <div className="space-y-0.5">
                            {/* Prescrit */}
                            <div className="flex items-center gap-1 text-blue-300/80">
                              {s.pWeight != null && <span className="font-semibold">{s.pWeight}kg</span>}
                              {s.pReps != null && <span className="text-zinc-500">×{s.pReps}</span>}
                              {s.pRpe != null && <span className="text-zinc-600">@{s.pRpe}</span>}
                            </div>
                            {/* Réel (past/current only) */}
                            {(isPast || isCurrent) && s.aWeight != null && (
                              <div className="flex items-center gap-1 text-amber-300/80">
                                <span className="font-semibold">{s.aWeight}kg</span>
                                {s.aReps != null && <span className="text-zinc-500">×{s.aReps}</span>}
                                {s.aRpe != null && <span className="text-zinc-600">@{s.aRpe}</span>}
                              </div>
                            )}
                            {/* Delta */}
                            {s.delta != null && s.delta !== 0 && (
                              <div className={`flex items-center gap-0.5 text-[8px] font-bold ${s.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                <span>{s.delta > 0 ? '↑' : '↓'}</span>
                                <span>{s.delta > 0 ? '+' : ''}{s.delta}kg</span>
                                {s.deltaPct != null && (
                                  <span className="text-zinc-600">
                                    ({s.deltaPct > 0 ? '+' : ''}{s.deltaPct.toFixed(1)}%)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
