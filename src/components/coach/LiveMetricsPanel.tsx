'use client'

/**
 * LiveMetricsPanel — panneau temps réel des métriques d'un bloc.
 *
 * Charge GET /api/blocks/:id/metrics (re-fetch sur demande via prop `refreshKey`).
 *
 * Rend pour chaque semaine :
 *   - Tonnage / N sets / Mean RPE / Total CS·PS·TS
 *   - Ratio aigu/chronique (tonnage + TS) — vert si <1.10, jaune <1.30, rouge sinon
 *   - Distribution sets par catégorie (Squat / Hinge / H-Push / H-Pull / V-Push / V-Pull / Accessoire / Cardio)
 *   - Barre CS vs PS (proportion)
 */

import { useEffect, useState } from 'react'
import type { BlockDisplayConfig } from '@/types/database'
import { DEFAULT_DISPLAY_CONFIG } from '@/types/database'

export interface WeekMetric {
  week: number
  tonnage: number
  /** Impulse = Σ (tonnage_set × weight/e1rm) — tonnage pondéré par l'intensité relative */
  impulse: number
  tonnage_prescribed: number
  tonnage_actual: number
  impulse_prescribed: number
  impulse_actual: number
  n_sets: number
  mean_rpe: number | null
  total_cs: number
  total_ps: number
  total_ts: number
  total_cs_prescribed: number
  total_ps_prescribed: number
  total_ts_prescribed: number
  total_cs_actual: number
  total_ps_actual: number
  total_ts_actual: number
  by_category: Record<string, number>
  stress_by_category?: Record<string, { cs: number; ps: number; impulse: number; n_sets: number; tonnage: number }>
  chronic: { tonnage: number; ts: number; impulse: number; cs: number; ps: number }
  ratio: RatioSet
  ratio_prescribed: RatioSet
  ratio_actual: RatioSet
}

interface RatioSet {
  tonnage: number | null
  impulse: number | null
  cs: number | null
  ps: number | null
  ts: number | null
}

interface Props {
  blockId: string
  refreshKey?: number
  /** semaine actuellement focus dans l'éditeur (pour highlighter) */
  activeWeek?: number
  /** callback pour changer de semaine en cliquant sur une carte */
  onSelectWeek?: (week: number) => void
  /** Nombre total de semaines du bloc — détermine combien de cartes afficher,
   *  indépendamment du fait qu'il y ait déjà des séances ou non. */
  totalWeeks?: number
  displayConfig?: BlockDisplayConfig
}

const EMPTY_WEEK = (week: number): WeekMetric => ({
  week,
  tonnage: 0,
  impulse: 0,
  tonnage_prescribed: 0,
  tonnage_actual: 0,
  impulse_prescribed: 0,
  impulse_actual: 0,
  n_sets: 0,
  mean_rpe: null,
  total_cs: 0,
  total_ps: 0,
  total_ts: 0,
  total_cs_prescribed: 0,
  total_ps_prescribed: 0,
  total_ts_prescribed: 0,
  total_cs_actual: 0,
  total_ps_actual: 0,
  total_ts_actual: 0,
  by_category: {},
  stress_by_category: {},
  chronic: { tonnage: 0, ts: 0, impulse: 0, cs: 0, ps: 0 },
  ratio: { tonnage: null, impulse: null, cs: null, ps: null, ts: null },
  ratio_prescribed: { tonnage: null, impulse: null, cs: null, ps: null, ts: null },
  ratio_actual: { tonnage: null, impulse: null, cs: null, ps: null, ts: null },
})

export default function LiveMetricsPanel({ blockId, refreshKey = 0, activeWeek, onSelectWeek, totalWeeks, displayConfig }: Props) {
  const cfg = displayConfig ?? DEFAULT_DISPLAY_CONFIG
  const [weeks, setWeeks] = useState<WeekMetric[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/blocks/${blockId}/metrics`)
      if (cancelled) return
      if (!res.ok) {
        setError('Impossible de charger les métriques')
        setLoading(false)
        return
      }
      const data = await res.json()
      setWeeks(data.weeks ?? [])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [blockId, refreshKey])

  if (loading && weeks.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
        Calcul des métriques…
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>
    )
  }
  // Construit la liste finale : 1..totalWeeks (si fourni), sinon les semaines
  // remontées par l'API. Si le coach a réduit total_weeks, on tronque ; s'il l'a
  // augmenté, on remplit les semaines manquantes avec des agrégats vides.
  const byWeek = new Map(weeks.map(w => [w.week, w]))
  const displayedWeeks: WeekMetric[] =
    totalWeeks && totalWeeks > 0
      ? Array.from({ length: totalWeeks }, (_, i) => byWeek.get(i + 1) ?? EMPTY_WEEK(i + 1))
      : weeks

  if (displayedWeeks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
        Pas encore de séances dans ce bloc.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-zinc-400">Métriques live</h3>
        <span className="text-[11px] text-zinc-600">
          chronique = moy. 4 sem. précédentes
        </span>
      </div>

      <div className="space-y-2">
        {displayedWeeks.map(w => (
          <WeekRow
            key={w.week}
            w={w}
            active={activeWeek === w.week}
            onSelect={onSelectWeek ? () => onSelectWeek(w.week) : undefined}
            cfg={cfg}
          />
        ))}
      </div>

      {/* Légende ratio */}
      <div className="flex items-center gap-3 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-emerald-500" />
          ≤ 1.10 (sûr)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-amber-500" />
          1.10–1.30
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-red-500" />
          &gt; 1.30 (risque)
        </span>
      </div>
    </div>
  )
}

type MetricColKey = 'tonnage' | 'impulse' | 'cs' | 'ps' | 'ts'

interface MetricCol {
  key: MetricColKey
  label: string
  configKey: keyof BlockDisplayConfig
  prescribedValue: (w: WeekMetric) => string
  actualValue: (w: WeekMetric) => string
  prescribedRatio: (w: WeekMetric) => number | null
  actualRatio: (w: WeekMetric) => number | null
  prescribedCls: string
  actualCls: string
}

const ALL_METRIC_COLS: MetricCol[] = [
  {
    key: 'tonnage', label: 'Tonnage', configKey: 'show_tonnage',
    prescribedValue: w => (w.tonnage_prescribed > 0 ? `${(w.tonnage_prescribed / 1000).toFixed(1)}t` : '—'),
    actualValue:     w => (w.tonnage_actual > 0 ? `${(w.tonnage_actual / 1000).toFixed(1)}t` : '—'),
    prescribedRatio: w => w.ratio_prescribed.tonnage, actualRatio: w => w.ratio_actual.tonnage,
    prescribedCls: 'text-zinc-400', actualCls: 'text-white',
  },
  {
    key: 'impulse', label: 'Impulse', configKey: 'show_impulse',
    prescribedValue: w => (w.impulse_prescribed > 0 ? `${(w.impulse_prescribed / 1000).toFixed(2)}t²` : '—'),
    actualValue:     w => (w.impulse_actual > 0 ? `${(w.impulse_actual / 1000).toFixed(2)}t²` : '—'),
    prescribedRatio: w => w.ratio_prescribed.impulse, actualRatio: w => w.ratio_actual.impulse,
    prescribedCls: 'text-violet-300/70', actualCls: 'text-violet-300',
  },
  {
    key: 'cs', label: 'CS', configKey: 'show_cs',
    prescribedValue: w => (w.total_cs_prescribed > 0 ? w.total_cs_prescribed.toFixed(1) : '—'),
    actualValue:     w => (w.total_cs_actual > 0 ? w.total_cs_actual.toFixed(1) : '—'),
    prescribedRatio: w => w.ratio_prescribed.cs, actualRatio: w => w.ratio_actual.cs,
    prescribedCls: 'text-blue-400/70', actualCls: 'text-blue-400',
  },
  {
    key: 'ps', label: 'PS', configKey: 'show_ps',
    prescribedValue: w => (w.total_ps_prescribed > 0 ? w.total_ps_prescribed.toFixed(1) : '—'),
    actualValue:     w => (w.total_ps_actual > 0 ? w.total_ps_actual.toFixed(1) : '—'),
    prescribedRatio: w => w.ratio_prescribed.ps, actualRatio: w => w.ratio_actual.ps,
    prescribedCls: 'text-amber-400/70', actualCls: 'text-amber-400',
  },
  {
    key: 'ts', label: 'TS', configKey: 'show_ts',
    prescribedValue: w => (w.total_ts_prescribed > 0 ? w.total_ts_prescribed.toFixed(1) : '—'),
    actualValue:     w => (w.total_ts_actual > 0 ? w.total_ts_actual.toFixed(1) : '—'),
    prescribedRatio: w => w.ratio_prescribed.ts, actualRatio: w => w.ratio_actual.ts,
    prescribedCls: 'text-emerald-400/70', actualCls: 'text-emerald-400',
  },
]

function WeekRow({ w, active, onSelect, cfg }: { w: WeekMetric; active: boolean; onSelect?: () => void; cfg: BlockDisplayConfig }) {
  const visibleCols = ALL_METRIC_COLS.filter(c => cfg[c.configKey] !== false)

  // Proportion CS / PS — utilise réalisé si dispo, sinon prescrit
  const csForBar = w.total_cs_actual > 0 ? w.total_cs_actual : w.total_cs_prescribed
  const psForBar = w.total_ps_actual > 0 ? w.total_ps_actual : w.total_ps_prescribed
  const totalStress = csForBar + psForBar
  const csPct = totalStress > 0 ? (csForBar / totalStress) * 100 : 0
  const psPct = totalStress > 0 ? (psForBar / totalStress) * 100 : 0

  // Catégories triées
  const cats = Object.entries(w.by_category).sort((a, b) => b[1] - a[1])

  const weekHasActual = w.tonnage_actual > 0 || w.total_cs_actual > 0 || w.impulse_actual > 0
  const hideMode = cfg.prescribed_only_if_not_started === true
  const showPrescribedRow = cfg.show_metrics_prescribed !== false && (!hideMode || !weekHasActual)
  const showActualRow = cfg.show_metrics_actual !== false && (!hideMode || weekHasActual)

  const colCount = visibleCols.length
  const gridStyle: React.CSSProperties = { gridTemplateColumns: `auto ${Array(colCount).fill('1fr').join(' ')}` }

  return (
    <div
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={onSelect ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } } : undefined}
      className={`rounded-lg border p-3 transition-colors ${
        active ? 'border-orange-500/60 bg-orange-500/[0.04]' : 'border-zinc-800 bg-zinc-950'
      } ${onSelect ? 'cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/50' : ''}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-white">Semaine {w.week}</span>
        <span className="text-[11px] text-zinc-500">{w.n_sets} sets</span>
      </div>

      {/* Cumul semaine — colonnes dynamiques selon displayConfig */}
      {visibleCols.length > 0 && (
        <div className="mb-2 rounded-md bg-zinc-900 p-2">
          <div className="grid items-center gap-x-2 gap-y-1 text-[11px]" style={gridStyle}>
            {/* Header */}
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Cumul</span>
            {visibleCols.map(c => (
              <span key={c.key} className="text-center text-[10px] uppercase tracking-wider text-zinc-500">{c.label}</span>
            ))}

            {/* Prescrit */}
            {showPrescribedRow && (
              <>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Prescrit</span>
                {visibleCols.map(c => (
                  <span key={c.key} className={`text-center font-mono ${c.prescribedCls}`}>{c.prescribedValue(w)}</span>
                ))}
              </>
            )}

            {/* Réalisé */}
            {showActualRow && (
              <>
                <span className="text-[10px] uppercase tracking-wider text-zinc-300">Réalisé</span>
                {visibleCols.map(c => (
                  <span key={c.key} className={`text-center font-mono font-semibold ${c.actualCls}`}>{c.actualValue(w)}</span>
                ))}
              </>
            )}

            {/* Ratios A/C */}
            {cfg.show_ratio_ac !== false && (
              <>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500" title="aigu prescrit / chronique réalisé (moy. 4 sem.)">A/C presc.</span>
                {visibleCols.map(c => (
                  <span key={c.key} className="text-center text-[10px]">{ratioCell(c.prescribedRatio(w))}</span>
                ))}

                <span className="text-[10px] uppercase tracking-wider text-zinc-300" title="aigu réalisé / chronique réalisé (moy. 4 sem.)">A/C réel</span>
                {visibleCols.map(c => (
                  <span key={c.key} className="text-center text-[10px]">{ratioCell(c.actualRatio(w))}</span>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* RPE moy */}
      {cfg.show_mean_rpe !== false && (
        <div className="mb-2 grid grid-cols-1 gap-2 text-center">
          <Mini label="RPE moy." value={w.mean_rpe != null ? w.mean_rpe.toFixed(1) : '—'} />
        </div>
      )}

      {/* CS vs PS bar — visible si CS ou PS visible */}
      {(cfg.show_cs !== false || cfg.show_ps !== false) && totalStress > 0 && (
        <div className="mb-2">
          <div className="mb-0.5 flex items-center justify-between text-[10px] uppercase text-zinc-500">
            <span>Central {csForBar.toFixed(1)}</span>
            <span>Périphérique {psForBar.toFixed(1)}</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-900">
            <div className="bg-blue-500" style={{ width: `${csPct}%` }} />
            <div className="bg-amber-500" style={{ width: `${psPct}%` }} />
          </div>
        </div>
      )}

      {/* Catégories : sets par catégorie */}
      {cfg.show_sets_by_category !== false && cats.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Sets par catégorie</div>
          <div className="flex flex-wrap gap-1.5">
            {cats.map(([cat, n]) => (
              <span key={cat} className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300">
                <span className="font-mono text-zinc-400">{n}</span>
                {' set'}
                {n > 1 ? 's' : ''}
                {' catégorie '}
                <span className="font-semibold text-white">{cat.toLowerCase()}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Mini({ label, value, subtitle }: { label: string; value: string; subtitle?: React.ReactNode }) {
  return (
    <div className="rounded-md bg-zinc-900 p-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="font-mono text-sm font-semibold text-white">{value}</div>
      {subtitle && <div className="mt-0.5 text-[10px]">{subtitle}</div>}
    </div>
  )
}

function ratioTone(ratio: number | null): 'green' | 'amber' | 'red' | 'neutral' {
  if (ratio == null) return 'neutral'
  if (ratio <= 1.1) return 'green'
  if (ratio <= 1.3) return 'amber'
  return 'red'
}

function ratioCell(ratio: number | null) {
  if (ratio == null) return <span className="text-zinc-600">—</span>
  const tone = ratioTone(ratio)
  const cls =
    tone === 'green' ? 'text-emerald-400' :
    tone === 'amber' ? 'text-amber-400' :
    tone === 'red' ? 'text-red-400' : 'text-zinc-500'
  return (
    <span className={`font-mono ${cls}`}>
      ● {ratio.toFixed(2)}×
    </span>
  )
}
