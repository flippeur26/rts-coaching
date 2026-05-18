'use client'

/**
 * GaugesGrid — grille de jauges (compteur de vitesse) pour les métriques actives
 * du `displayConfig`, calées sur la semaine active et la catégorie filtrée.
 *
 * Min/Max viennent de l'endpoint `/api/blocks/[id]/bounds` (3 derniers blocs,
 * paires (W, W+1) classées progression/régression d'E1RM).
 *
 * Valeur courante = somme des métriques de la semaine active sur les catégories
 * incluses dans le filtre. Pour 'Tous' on utilise les agrégats globaux du WeekMetric.
 */

import type { BlockDisplayConfig } from '@/types/database'
import type { WeekMetric } from '../LiveMetricsPanel'
import type { BoundsResponse, BoundsMetric } from '@/lib/bounds-engine'
import { CATEGORY_FILTER_MAP, type CategoryFilter } from '@/lib/category-filter'
import GaugeChart from './GaugeChart'

interface Props {
  metric: WeekMetric | undefined
  bounds: BoundsResponse | null
  category: CategoryFilter
  displayConfig: BlockDisplayConfig
}

interface GaugeDef {
  key: BoundsMetric
  label: string
  configKey: keyof BlockDisplayConfig
  unit?: string
  formatValue?: (v: number) => string
  formatBound?: (v: number) => string
}

const GAUGE_DEFS: GaugeDef[] = [
  {
    key: 'tonnage',
    label: 'Tonnage',
    configKey: 'show_tonnage',
    unit: 't',
    formatValue: v => (v > 0 ? (v / 1000).toFixed(1) : '0'),
    formatBound: v => (v > 0 ? (v / 1000).toFixed(1) + 't' : '0'),
  },
  {
    key: 'impulse',
    label: 'Impulse',
    configKey: 'show_impulse',
    unit: 't²',
    formatValue: v => (v > 0 ? (v / 1000).toFixed(2) : '0'),
    formatBound: v => (v > 0 ? (v / 1000).toFixed(2) : '0'),
  },
  { key: 'cs', label: 'CS', configKey: 'show_cs' },
  { key: 'ps', label: 'PS', configKey: 'show_ps' },
  { key: 'ts', label: 'TS', configKey: 'show_ts' },
  { key: 'nl', label: 'NL', configKey: 'show_nl' },
]

function getCurrentValue(metric: WeekMetric, category: CategoryFilter, key: BoundsMetric): number {
  if (category === 'Tous') {
    switch (key) {
      case 'tonnage': return metric.tonnage
      case 'impulse': return metric.impulse
      case 'cs': return metric.total_cs
      case 'ps': return metric.total_ps
      case 'ts': return metric.total_ts
      case 'nl': return metric.n_sets
    }
  }
  // Filtre catégorie : on somme sur les catégories du filtre via stress_by_category
  const cats = CATEGORY_FILTER_MAP[category]
  const sbc = metric.stress_by_category ?? {}
  let cs = 0, ps = 0, impulse = 0, nSets = 0, tonnage = 0
  for (const c of cats) {
    const entry = sbc[c]
    if (!entry) continue
    cs += entry.cs
    ps += entry.ps
    impulse += entry.impulse
    nSets += entry.n_sets
    tonnage += entry.tonnage ?? 0
  }
  switch (key) {
    case 'tonnage': return tonnage
    case 'impulse': return impulse
    case 'cs': return cs
    case 'ps': return ps
    case 'ts': return cs + ps
    case 'nl': return nSets
  }
}

export default function GaugesGrid({ metric, bounds, category, displayConfig }: Props) {
  const visible = GAUGE_DEFS.filter(g => displayConfig[g.configKey] !== false)
  if (visible.length === 0) return null

  if (!metric || !bounds) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
        {!bounds ? 'Calcul des repères en cours…' : 'Pas de données pour cette semaine.'}
      </div>
    )
  }

  const catBounds = bounds[category]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {visible.map(g => {
        const value = getCurrentValue(metric, category, g.key)
        const b = catBounds?.[g.key]
        const min = b?.min ?? 0
        const max = b?.max ?? 0
        const fallback = b?.fallback ?? true
        return (
          <GaugeChart
            key={g.key}
            label={g.label}
            value={value}
            min={min}
            max={max}
            unit={g.unit}
            formatValue={g.formatValue}
            formatBound={g.formatBound}
            fallback={fallback}
          />
        )
      })}
    </div>
  )
}
