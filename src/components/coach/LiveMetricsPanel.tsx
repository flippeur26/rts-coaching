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

interface WeekMetric {
  week: number
  tonnage: number
  /** Impulse = Σ (tonnage_set × weight/e1rm) — tonnage pondéré par l'intensité relative */
  impulse: number
  n_sets: number
  mean_rpe: number | null
  total_cs: number
  total_ps: number
  total_ts: number
  by_category: Record<string, number>
  chronic: { tonnage: number; ts: number }
  ratio: { tonnage: number | null; ts: number | null }
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
}

const EMPTY_WEEK = (week: number): WeekMetric => ({
  week,
  tonnage: 0,
  impulse: 0,
  n_sets: 0,
  mean_rpe: null,
  total_cs: 0,
  total_ps: 0,
  total_ts: 0,
  by_category: {},
  chronic: { tonnage: 0, ts: 0 },
  ratio: { tonnage: null, ts: null },
})

export default function LiveMetricsPanel({ blockId, refreshKey = 0, activeWeek, onSelectWeek, totalWeeks }: Props) {
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

function WeekRow({ w, active, onSelect }: { w: WeekMetric; active: boolean; onSelect?: () => void }) {
  const ratioTonnage = w.ratio.tonnage
  const ratioTs = w.ratio.ts
  const tonneTone = ratioTone(ratioTonnage)
  const tsTone = ratioTone(ratioTs)

  // Proportion CS / PS
  const totalStress = w.total_cs + w.total_ps
  const csPct = totalStress > 0 ? (w.total_cs / totalStress) * 100 : 0
  const psPct = totalStress > 0 ? (w.total_ps / totalStress) * 100 : 0

  // Catégories triées
  const cats = Object.entries(w.by_category).sort((a, b) => b[1] - a[1])

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

      {/* Tonnage+Impulse / RPE / Total Stress */}
      <div className="mb-2 grid grid-cols-3 gap-2 text-center">
        <MiniDouble
          labelA="Tonnage"
          valueA={`${(w.tonnage / 1000).toFixed(1)}t`}
          subtitleA={ratioBadge(ratioTonnage, tonneTone)}
          labelB="Impulse"
          valueB={w.impulse > 0 ? `${(w.impulse / 1000).toFixed(2)}t²` : '—'}
          hintB="Tonnage × %e1RM — intensité pondérée"
        />
        <Mini label="RPE moy." value={w.mean_rpe != null ? w.mean_rpe.toFixed(1) : '—'} />
        <Mini label="TS total" value={w.total_ts.toFixed(1)} subtitle={ratioBadge(ratioTs, tsTone)} />
      </div>

      {/* CS vs PS bar */}
      {totalStress > 0 && (
        <div className="mb-2">
          <div className="mb-0.5 flex items-center justify-between text-[10px] uppercase text-zinc-500">
            <span>Central {w.total_cs.toFixed(1)}</span>
            <span>Périphérique {w.total_ps.toFixed(1)}</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-900">
            <div className="bg-blue-500" style={{ width: `${csPct}%` }} />
            <div className="bg-amber-500" style={{ width: `${psPct}%` }} />
          </div>
        </div>
      )}

      {/* Catégories : sets par catégorie */}
      {cats.length > 0 && (
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

/** Carte double : deux métriques empilées dans la même case. */
function MiniDouble({
  labelA, valueA, subtitleA,
  labelB, valueB, hintB,
}: {
  labelA: string; valueA: string; subtitleA?: React.ReactNode
  labelB: string; valueB: string; hintB?: string
}) {
  return (
    <div className="rounded-md bg-zinc-900 p-2" title={hintB}>
      {/* Tonnage */}
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{labelA}</div>
      <div className="font-mono text-sm font-semibold text-white">{valueA}</div>
      {subtitleA && <div className="mt-0.5 text-[10px]">{subtitleA}</div>}
      {/* Séparateur */}
      <div className="my-1.5 border-t border-zinc-800" />
      {/* Impulse */}
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{labelB}</div>
      <div className="font-mono text-sm font-semibold text-violet-300">{valueB}</div>
    </div>
  )
}

function ratioTone(ratio: number | null): 'green' | 'amber' | 'red' | 'neutral' {
  if (ratio == null) return 'neutral'
  if (ratio <= 1.1) return 'green'
  if (ratio <= 1.3) return 'amber'
  return 'red'
}

function ratioBadge(ratio: number | null, tone: 'green' | 'amber' | 'red' | 'neutral') {
  if (ratio == null) return <span className="text-zinc-600">—</span>
  const cls =
    tone === 'green' ? 'text-emerald-400' :
    tone === 'amber' ? 'text-amber-400' :
    tone === 'red' ? 'text-red-400' : 'text-zinc-500'
  const icon =
    tone === 'green' ? '●' :
    tone === 'amber' ? '●' :
    tone === 'red' ? '●' : ''
  return (
    <span className={`font-mono ${cls}`}>
      {icon} {ratio.toFixed(2)}×
    </span>
  )
}
