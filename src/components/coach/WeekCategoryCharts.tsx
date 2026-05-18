'use client'

import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { WeekMetric } from './LiveMetricsPanel'

interface Props {
  blockId: string
  refreshKey?: number
  totalWeeks?: number
}

/** Regroupe les catégories API en 4 groupes visuels */
const GROUPS: { label: string; categories: string[] }[] = [
  { label: 'Push', categories: ['Horizontal Push', 'Vertical Push'] },
  { label: 'Hinge', categories: ['Hinge'] },
  { label: 'Squat', categories: ['Squat'] },
  { label: 'Reste', categories: ['Horizontal Pull', 'Vertical Pull', 'Accessoire', 'Cardio'] },
]

function mergeGroupMetrics(
  stressByCat: Record<string, { cs: number; ps: number; impulse: number; n_sets: number }> | undefined,
  categories: string[],
) {
  let cs = 0, ps = 0, impulse = 0
  for (const cat of categories) {
    const m = stressByCat?.[cat]
    if (m) { cs += m.cs; ps += m.ps; impulse += m.impulse }
  }
  return { cs, ps, impulse }
}

export default function WeekCategoryCharts({ blockId, refreshKey = 0, totalWeeks }: Props) {
  const [weeks, setWeeks] = useState<WeekMetric[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/blocks/${blockId}/metrics`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return
        setWeeks(data.weeks ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [blockId, refreshKey])

  const byWeek = new Map(weeks.map(w => [w.week, w]))
  const displayedWeeks: WeekMetric[] =
    totalWeeks && totalWeeks > 0
      ? Array.from({ length: totalWeeks }, (_, i) => byWeek.get(i + 1) ?? {
          week: i + 1, tonnage: 0, impulse: 0, tonnage_prescribed: 0, tonnage_actual: 0,
          impulse_prescribed: 0, impulse_actual: 0, n_sets: 0, mean_rpe: null,
          total_cs: 0, total_ps: 0, total_ts: 0,
          total_cs_prescribed: 0, total_ps_prescribed: 0, total_ts_prescribed: 0,
          total_cs_actual: 0, total_ps_actual: 0, total_ts_actual: 0,
          by_category: {}, stress_by_category: {},
          chronic: { tonnage: 0, ts: 0, impulse: 0, cs: 0, ps: 0 },
          ratio: { tonnage: null, impulse: null, cs: null, ps: null, ts: null },
          ratio_prescribed: { tonnage: null, impulse: null, cs: null, ps: null, ts: null },
          ratio_actual: { tonnage: null, impulse: null, cs: null, ps: null, ts: null },
        } as WeekMetric)
      : weeks

  if (loading && displayedWeeks.length === 0) {
    return <div className="text-[11px] text-zinc-600">Chargement des graphiques…</div>
  }

  const hasData = displayedWeeks.some(w => w.n_sets > 0)
  if (!hasData) return null

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <h3 className="text-xs uppercase tracking-wider text-zinc-400">Répartition stress par mouvement</h3>
      <div className="grid grid-cols-2 gap-4">
        {GROUPS.map(group => {
          const chartData = displayedWeeks.map(w => {
            const m = mergeGroupMetrics(w.stress_by_category, group.categories)
            return {
              name: `S${w.week}`,
              CS: parseFloat(m.cs.toFixed(1)),
              PS: parseFloat(m.ps.toFixed(1)),
              Impulse: parseFloat((m.impulse / 1000).toFixed(2)),
            }
          })
          const hasGroupData = chartData.some(d => d.CS > 0 || d.PS > 0 || d.Impulse > 0)

          return (
            <div key={group.label} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                {group.label}
              </div>
              {hasGroupData ? (
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={chartData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }} barCategoryGap="25%">
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: '#71717a' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: '#52525b' }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 11 }}
                      labelStyle={{ color: '#a1a1aa', fontSize: 10 }}
                      itemStyle={{ padding: '1px 0' }}
                      formatter={(value, name) =>
                        name === 'Impulse' ? [`${value}t²`, String(name)] : [value, String(name)]
                      }
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 10, color: '#71717a', paddingTop: 4 }}
                      iconSize={8}
                    />
                    <Bar dataKey="CS" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="PS" fill="#f59e0b" radius={[2, 2, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="Impulse" fill="#a78bfa" radius={[2, 2, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[140px] items-center justify-center text-[11px] text-zinc-600">
                  Aucune donnée
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-blue-500" /> CS = Central Stress</span>
        <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-amber-500" /> PS = Périphérique</span>
        <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-violet-400" /> Impulse (t²)</span>
      </div>
    </div>
  )
}
