'use client'

import { useEffect, useState } from 'react'
import { format, parseISO, addDays, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { WeekMetric } from './LiveMetricsPanel'
import type { Set as SetRow, Session } from '@/types/database'

type SessionWithSets = Session & { sets: SetRow[] }

interface Props {
  blockId: string
  refreshKey?: number
  totalWeeks?: number
  activeWeek: number
  blockStart: string
  currentWeekSessions: SessionWithSets[]
  onSelectWeek?: (week: number) => void
}

const JOURS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

function aggSets(sets: SetRow[]) {
  let tonnage = 0, cs = 0, ps = 0, ts = 0, rpeSum = 0, rpeCount = 0
  for (const s of sets) {
    const sx = s as SetRow & {
      central_stress_prescribed?: number | null
      peripheral_stress_prescribed?: number | null
      total_stress_prescribed?: number | null
    }
    const w = sx.weight_actual_kg ?? sx.weight_prescribed_kg ?? 0
    const r = sx.reps_actual ?? sx.reps_prescribed ?? 0
    tonnage += (w || 0) * (r || 0)
    cs += sx.central_stress ?? sx.central_stress_prescribed ?? 0
    ps += sx.peripheral_stress ?? sx.peripheral_stress_prescribed ?? 0
    ts += sx.total_stress ?? sx.total_stress_prescribed ?? 0
    const rpe = sx.rpe_actual ?? sx.rpe_prescribed
    if (rpe != null) { rpeSum += rpe; rpeCount++ }
  }
  return {
    tonnage,
    cs: parseFloat(cs.toFixed(1)),
    ps: parseFloat(ps.toFixed(1)),
    ts: parseFloat(ts.toFixed(1)),
    rpe: rpeCount ? parseFloat((rpeSum / rpeCount).toFixed(1)) : null,
  }
}

function fmtKg(v: number) { return v > 0 ? `${(v / 1000).toFixed(1)}t` : '—' }
function fmtNum(v: number) { return v > 0 ? v.toFixed(1) : '—' }

export default function WeekSummaryTables({
  blockId,
  refreshKey = 0,
  totalWeeks,
  activeWeek,
  blockStart,
  currentWeekSessions,
  onSelectWeek,
}: Props) {
  const [allWeeks, setAllWeeks] = useState<WeekMetric[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/blocks/${blockId}/metrics`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return
        setAllWeeks(data.weeks ?? [])
      })
    return () => { cancelled = true }
  }, [blockId, refreshKey])

  const byWeek = new Map(allWeeks.map(w => [w.week, w]))
  const displayedWeeks: WeekMetric[] =
    totalWeeks && totalWeeks > 0
      ? Array.from({ length: totalWeeks }, (_, i) => byWeek.get(i + 1) ?? {
          week: i + 1, tonnage: 0, impulse: 0,
          tonnage_prescribed: 0, tonnage_actual: 0,
          impulse_prescribed: 0, impulse_actual: 0,
          n_sets: 0, mean_rpe: null,
          total_cs: 0, total_ps: 0, total_ts: 0,
          total_cs_prescribed: 0, total_ps_prescribed: 0, total_ts_prescribed: 0,
          total_cs_actual: 0, total_ps_actual: 0, total_ts_actual: 0,
          by_category: {}, stress_by_category: {},
          chronic: { tonnage: 0, ts: 0, impulse: 0, cs: 0, ps: 0 },
          ratio: { tonnage: null, impulse: null, cs: null, ps: null, ts: null },
          ratio_prescribed: { tonnage: null, impulse: null, cs: null, ps: null, ts: null },
          ratio_actual: { tonnage: null, impulse: null, cs: null, ps: null, ts: null },
        } as WeekMetric)
      : allWeeks

  // Construire la grille jour par jour pour la semaine active
  const weekStartDate = addDays(
    startOfWeek(parseISO(blockStart + 'T00:00:00Z'), { weekStartsOn: 1 }),
    (activeWeek - 1) * 7,
  )

  // Map date string → sessions
  const sessionsByDate = new Map<string, SessionWithSets[]>()
  for (const sess of currentWeekSessions) {
    const d = sess.scheduled_date
    ;(sessionsByDate.get(d) ?? sessionsByDate.set(d, []).get(d)!).push(sess)
  }

  const dayRows: { label: string; date: string; sessions: SessionWithSets[] }[] = JOURS_FR.map((label, i) => {
    const d = addDays(weekStartDate, i)
    const dateStr = format(d, 'yyyy-MM-dd')
    return { label, date: dateStr, sessions: sessionsByDate.get(dateStr) ?? [] }
  })

  const hasWeekData = currentWeekSessions.some(s => s.sets.length > 0)

  return (
    <div className="space-y-4">

      {/* ── Tableau 1 : récap toutes semaines ── */}
      {displayedWeeks.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <h3 className="mb-3 text-xs uppercase tracking-wider text-zinc-400">Récap bloc — toutes semaines</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="py-1.5 pr-3 text-left font-medium">Sem.</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Sets</th>
                  <th className="py-1.5 pr-3 text-right font-medium text-zinc-400">Ton. P</th>
                  <th className="py-1.5 pr-3 text-right font-medium text-white">Ton. R</th>
                  <th className="py-1.5 pr-3 text-right font-medium text-blue-400">CS</th>
                  <th className="py-1.5 pr-3 text-right font-medium text-amber-400">PS</th>
                  <th className="py-1.5 pr-3 text-right font-medium text-emerald-400">TS</th>
                  <th className="py-1.5 text-right font-medium">RPE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {displayedWeeks.map(w => {
                  const isActive = w.week === activeWeek
                  const hasData = w.n_sets > 0
                  return (
                    <tr
                      key={w.week}
                      onClick={() => onSelectWeek?.(w.week)}
                      className={`transition-colors ${onSelectWeek ? 'cursor-pointer hover:bg-zinc-900/60' : ''} ${isActive ? 'bg-orange-500/[0.05]' : ''}`}
                    >
                      <td className={`py-1.5 pr-3 font-semibold ${isActive ? 'text-orange-400' : 'text-zinc-300'}`}>
                        S{w.week}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono text-zinc-500">{hasData ? w.n_sets : '—'}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-zinc-500">{fmtKg(w.tonnage_prescribed)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-white">{fmtKg(w.tonnage_actual)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-blue-400">{fmtNum(w.total_cs_actual || w.total_cs_prescribed)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-amber-400">{fmtNum(w.total_ps_actual || w.total_ps_prescribed)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-emerald-400">{fmtNum(w.total_ts_actual || w.total_ts_prescribed)}</td>
                      <td className="py-1.5 text-right font-mono text-zinc-300">
                        {w.mean_rpe != null ? w.mean_rpe.toFixed(1) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tableau 2 : suivi jour par jour semaine active ── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <h3 className="mb-3 text-xs uppercase tracking-wider text-zinc-400">
          Suivi semaine {activeWeek} — jour par jour
        </h3>
        {!hasWeekData && currentWeekSessions.length === 0 ? (
          <p className="text-[11px] text-zinc-600">Aucune séance cette semaine.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="py-1.5 pr-3 text-left font-medium">Jour</th>
                  <th className="py-1.5 pr-3 text-left font-medium">Séance</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Sets</th>
                  <th className="py-1.5 pr-3 text-right font-medium text-white">Tonnage</th>
                  <th className="py-1.5 pr-3 text-right font-medium text-blue-400">CS</th>
                  <th className="py-1.5 pr-3 text-right font-medium text-amber-400">PS</th>
                  <th className="py-1.5 pr-3 text-right font-medium text-emerald-400">TS</th>
                  <th className="py-1.5 text-right font-medium">RPE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {dayRows.map(({ label, date, sessions }) => {
                  if (sessions.length === 0) {
                    return (
                      <tr key={date} className="opacity-30">
                        <td className="py-1.5 pr-3 text-zinc-500">{label}</td>
                        <td className="py-1.5 pr-3 text-zinc-600" colSpan={7}>—</td>
                      </tr>
                    )
                  }
                  return sessions.map((sess, si) => {
                    const agg = aggSets(sess.sets)
                    const exercises = Array.from(new Set(sess.sets.map(s => s.exercise_name).filter(Boolean)))
                    const label2 = exercises.length > 0
                      ? exercises.slice(0, 2).join(' / ') + (exercises.length > 2 ? '…' : '')
                      : `Séance ${sess.session_number ?? si + 1}`
                    const hasActual = sess.sets.some(s => s.rpe_actual != null || s.weight_actual_kg != null)
                    return (
                      <tr key={sess.id} className="transition-colors hover:bg-zinc-900/40">
                        <td className="py-1.5 pr-3 text-zinc-300">{si === 0 ? label : ''}</td>
                        <td className="py-1.5 pr-3 max-w-[160px] truncate text-zinc-300" title={exercises.join(' / ')}>
                          {label2}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono text-zinc-500">{sess.sets.length}</td>
                        <td className={`py-1.5 pr-3 text-right font-mono ${hasActual ? 'text-white' : 'text-zinc-500'}`}>
                          {fmtKg(agg.tonnage)}
                        </td>
                        <td className={`py-1.5 pr-3 text-right font-mono ${hasActual ? 'text-blue-400' : 'text-blue-400/40'}`}>
                          {fmtNum(agg.cs)}
                        </td>
                        <td className={`py-1.5 pr-3 text-right font-mono ${hasActual ? 'text-amber-400' : 'text-amber-400/40'}`}>
                          {fmtNum(agg.ps)}
                        </td>
                        <td className={`py-1.5 pr-3 text-right font-mono ${hasActual ? 'text-emerald-400' : 'text-emerald-400/40'}`}>
                          {fmtNum(agg.ts)}
                        </td>
                        <td className={`py-1.5 text-right font-mono ${hasActual ? 'text-zinc-300' : 'text-zinc-600'}`}>
                          {agg.rpe != null ? agg.rpe.toFixed(1) : '—'}
                        </td>
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
