'use client'

import { useMemo, useRef, useEffect, useState } from 'react'
import { addDays, startOfWeek, parseISO, format } from 'date-fns'
import type { Set as SetRow, Session, BlockDisplayConfig } from '@/types/database'
import { guessCategory } from '@/lib/movement'
import type { CategoryFilter } from '@/lib/category-filter'

type SessionWithSets = Session & { sets: SetRow[] }

interface Props {
  activeWeek: number
  blockStart: string
  currentWeekSessions: SessionWithSets[]
  displayConfig?: BlockDisplayConfig
  categoryFilter?: CategoryFilter
}

const GROUPS = [
  { label: 'Push',  categories: ['Horizontal Push', 'Vertical Push'],                         color: '#f97316' },
  { label: 'Hinge', categories: ['Hinge'],                                                     color: '#a78bfa' },
  { label: 'Squat', categories: ['Squat'],                                                     color: '#22d3ee' },
  { label: 'Reste', categories: ['Horizontal Pull', 'Vertical Pull', 'Accessoire', 'Cardio'], color: '#86efac' },
]

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

type MetricKey = 'CS' | 'PS' | 'Impulse'
const ALL_METRICS: Array<{ key: MetricKey; color: string; label: string; configKey: keyof BlockDisplayConfig }> = [
  { key: 'CS',      color: '#3b82f6', label: 'CS',   configKey: 'show_cs' },
  { key: 'PS',      color: '#f59e0b', label: 'PS',   configKey: 'show_ps' },
  { key: 'Impulse', color: '#a78bfa', label: 'Imp.', configKey: 'show_impulse' },
]

type DayPoint = { CS: number; PS: number; Impulse: number }

/**
 * Interpolation monotone (Fritsch-Carlson) → pas d'overshoot, courbe ne passe jamais
 * sous le minimum des données (donc pas sous 0 si toutes valeurs ≥ 0).
 */
function smoothLinePath(pts: { x: number; y: number }[]): string {
  const n = pts.length
  if (n < 2) return ''

  // Pentes entre points consécutifs
  const dx = Array.from({ length: n - 1 }, (_, i) => pts[i + 1].x - pts[i].x)
  const dy = Array.from({ length: n - 1 }, (_, i) => pts[i + 1].y - pts[i].y)
  const m = Array.from({ length: n - 1 }, (_, i) => dy[i] / dx[i])

  // Tangentes aux nœuds (Fritsch-Carlson)
  const t = Array(n).fill(0)
  t[0] = m[0]
  t[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) { t[i] = 0 }
    else { t[i] = (m[i - 1] + m[i]) / 2 }
  }
  // Correction monotonie
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) < 1e-10) { t[i] = t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i]
    const r = a * a + b * b
    if (r > 9) { t[i] = 3 * m[i] / Math.sqrt(r); t[i + 1] = 3 * m[i] / Math.sqrt(r) }
  }

  const d: string[] = [`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`]
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]
    const cp1x = pts[i].x + h / 3
    const cp1y = pts[i].y + t[i] * h / 3
    const cp2x = pts[i + 1].x - h / 3
    const cp2y = pts[i + 1].y - t[i + 1] * h / 3
    d.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${pts[i+1].x.toFixed(1)} ${pts[i+1].y.toFixed(1)}`)
  }
  return d.join(' ')
}

function AreaChart({
  points,
  maxVal,
  chartH,
  cellRefs,
  metrics,
}: {
  points: DayPoint[]
  maxVal: number
  chartH: number
  cellRefs: React.RefObject<(HTMLDivElement | null)[]>
  metrics: typeof ALL_METRICS
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [coords, setCoords] = useState<{ x: number; y: Record<string, number> }[]>([])

  // Mesure les positions DOM et recalcule coords
  useEffect(() => {
    function measure() {
      const cells = cellRefs.current
      const svg = svgRef.current
      if (!cells || !svg) return
      const svgRect = svg.getBoundingClientRect()
      const next = points.map((p, i) => {
        const cell = cells[i]
        if (!cell) return null
        const rect = cell.getBoundingClientRect()
        const cx = rect.left + rect.width / 2 - svgRect.left
        const toY = (val: number) =>
          maxVal > 0 ? chartH - (val / maxVal) * (chartH - 8) : chartH
        return {
          x: cx,
          y: { CS: toY(p.CS), PS: toY(p.PS), Impulse: toY(p.Impulse) },
        }
      }).filter((v): v is NonNullable<typeof v> => v !== null)
      setCoords(next)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  })

  return (
    <svg ref={svgRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
      {coords.length > 1 && metrics.map(m => {
        const pts = coords.map(c => ({ x: c.x, y: c.y[m.key] }))
        const linePath = smoothLinePath(pts)
        return (
          <path key={m.key} d={linePath} fill="none" stroke={m.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        )
      })}

      {/* Dots creux sur chaque point */}
      {coords.map((c, i) =>
        metrics.map(m => {
          const val = points[i][m.key]
          return (
            <circle
              key={`${m.key}-${i}`}
              cx={c.x}
              cy={c.y[m.key]}
              r={val > 0 ? 4 : 2.5}
              fill={val > 0 ? '#0c0c0e' : '#1c1c1e'}
              stroke={m.color}
              strokeWidth={val > 0 ? 2 : 1}
              strokeOpacity={val > 0 ? 1 : 0.3}
            />
          )
        })
      )}
    </svg>
  )
}

function GroupChart({ group, points, metrics }: { group: typeof GROUPS[number]; points: DayPoint[]; metrics: typeof ALL_METRICS }) {
  const CHART_H = 100
  const cellRefs = useRef<(HTMLDivElement | null)[]>(Array(7).fill(null))

  const maxVal = useMemo(() => {
    let m = 0
    for (const p of points) for (const met of metrics) m = Math.max(m, p[met.key])
    return m || 1
  }, [points, metrics])

  const hasData = points.some(p => metrics.some(m => p[m.key] > 0))
  if (!hasData) return null

  // Y axis ticks (3 valeurs)
  const yTicks = [0, 0.5, 1].map(pct => ({
    pct,
    label: (maxVal * pct).toFixed(1),
  }))

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-3">
      {/* Header : label + légende */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full" style={{ background: group.color }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{group.label}</span>
        </div>
        <div className="flex items-center gap-3">
          {metrics.map(m => (
            <span key={m.key} className="flex items-center gap-1 text-[10px]" style={{ color: m.color }}>
              <span className="inline-block size-1.5 rounded-full" style={{ background: m.color }} />
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* Jours — même grid-cols-7 gap-2 que le calendrier */}
      <div className="mb-1 grid grid-cols-7 gap-2">
        {JOURS.map(j => (
          <div key={j} className="text-center text-[10px] text-zinc-500">{j}</div>
        ))}
      </div>

      {/* Zone graphique */}
      <div className="relative" style={{ height: CHART_H }}>
        {/* Y axis absolu à gauche (hors du flux grid) */}
        <div className="pointer-events-none absolute -left-10 inset-y-0 flex w-9 flex-col justify-between">
          {[...yTicks].reverse().map(t => (
            <span key={t.pct} className="text-right text-[9px] font-mono text-zinc-600 leading-none">
              {t.label}
            </span>
          ))}
        </div>

        {/* Lignes horizontales de référence */}
        {yTicks.map(t => (
          <div
            key={t.pct}
            className="absolute inset-x-0 border-t border-zinc-800/50"
            style={{ bottom: `${t.pct * 100}%` }}
          />
        ))}

        {/* SVG area chart */}
        <AreaChart
          points={points}
          maxVal={maxVal}
          chartH={CHART_H}
          cellRefs={cellRefs as React.RefObject<(HTMLDivElement | null)[]>}
          metrics={metrics}
        />

        {/* Ancres DOM pour les positions x — même grid-cols-7 gap-2 */}
        <div className="grid h-full grid-cols-7 gap-2">
          {points.map((p, i) => (
            <div
              key={i}
              ref={el => { cellRefs.current[i] = el }}
              className="group relative"
            >
              {metrics.some(m => p[m.key] > 0) && (
                <div className="absolute bottom-full left-1/2 z-10 mb-3 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] shadow-lg group-hover:block">
                  {metrics.map((m, mi) => (
                    <span key={m.key}>
                      {mi > 0 && <span className="text-zinc-600"> · </span>}
                      <span style={{ color: m.color }}>{m.label === 'Imp.' ? 'Imp.' : m.label} {p[m.key].toFixed(m.key === 'Impulse' ? 2 : 1)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function WeekDailyCharts({ activeWeek, blockStart, currentWeekSessions, displayConfig, categoryFilter = 'Tous' }: Props) {
  const metrics = ALL_METRICS.filter(m => displayConfig?.[m.configKey] !== false)
  const visibleGroups = categoryFilter === 'Tous'
    ? GROUPS
    : GROUPS.filter(g => g.label === categoryFilter)
  const chartData = useMemo(() => {
    const weekStart = addDays(
      startOfWeek(parseISO(blockStart + 'T00:00:00Z'), { weekStartsOn: 1 }),
      (activeWeek - 1) * 7,
    )
    const days = Array.from({ length: 7 }, (_, i) =>
      format(addDays(weekStart, i), 'yyyy-MM-dd'),
    )

    return visibleGroups.map(group => {
      const points: DayPoint[] = days.map(date => {
        let cs = 0, ps = 0, impulseRaw = 0
        for (const sess of currentWeekSessions) {
          if (sess.scheduled_date !== date) continue
          for (const s of sess.sets) {
            const sx = s as SetRow & {
              central_stress_prescribed?: number | null
              peripheral_stress_prescribed?: number | null
              impulse_actual?: number | null
              impulse_prescribed?: number | null
            }
            if (!group.categories.includes(guessCategory(sx.exercise_name || ''))) continue
            cs += sx.central_stress ?? sx.central_stress_prescribed ?? 0
            ps += sx.peripheral_stress ?? sx.peripheral_stress_prescribed ?? 0
            const e1rm = sx.e1rm_kg
            const w = sx.weight_actual_kg ?? sx.weight_prescribed_kg ?? 0
            const r = sx.reps_actual ?? sx.reps_prescribed ?? 0
            if (e1rm && e1rm > 0 && w) {
              impulseRaw += w * r * (w / e1rm)
            } else {
              impulseRaw += sx.impulse_actual ?? sx.impulse_prescribed ?? 0
            }
          }
        }
        return {
          CS: parseFloat(cs.toFixed(2)),
          PS: parseFloat(ps.toFixed(2)),
          Impulse: parseFloat((impulseRaw / 1000).toFixed(3)),
        }
      })
      return { group, points }
    })
  }, [activeWeek, blockStart, currentWeekSessions, visibleGroups])

  const hasAnyData = chartData.some(({ points }) =>
    points.some(p => metrics.some(m => p[m.key] > 0)),
  )
  if (!hasAnyData || metrics.length === 0) return null

  return (
    <div className="space-y-2">
      {chartData.map(({ group, points }) => (
        <GroupChart key={group.label} group={group} points={points} metrics={metrics} />
      ))}
    </div>
  )
}
