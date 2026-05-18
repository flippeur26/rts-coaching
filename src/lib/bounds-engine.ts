/**
 * bounds-engine — calcul des bornes adaptatives min/max pour les jauges de l'éditeur de bloc.
 *
 * Principe :
 *   - On regarde les 3 derniers blocs de l'athlète (bloc courant inclus)
 *   - Pour chaque couple (catégorie de mouvement, métrique de charge) :
 *       MIN = plus petite valeur hebdo qui a permis une progression d'E1RM la semaine suivante
 *       MAX = plus grande valeur hebdo observée avant une régression d'E1RM
 *   - Si pas assez d'historique → fallback chronique × 1.0 / 1.3
 *
 * L'agrégation E1RM par semaine prend le MAX des sets de la catégorie (= pic de force,
 * non dilué par les sets de récupération).
 *
 * Les paires (W, W+1) sont comparées uniquement à l'intérieur d'un même bloc — la coupure
 * inter-blocs marque un changement de programmation et fausserait le delta.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Set as SetRow } from '@/types/database'
import { guessCategory, type MovementCategory } from './movement'
import { CATEGORY_FILTER_MAP, type CategoryFilter } from './category-filter'

export type BoundsMetric = 'tonnage' | 'impulse' | 'cs' | 'ps' | 'ts' | 'nl'
export const BOUNDS_METRICS: BoundsMetric[] = ['tonnage', 'impulse', 'cs', 'ps', 'ts', 'nl']

export interface BoundsValue {
  min: number
  max: number
  fallback: boolean
  n_progression: number
  n_regression: number
}

export type BoundsResponse = Record<CategoryFilter, Record<BoundsMetric, BoundsValue>>

type SetWithExtras = SetRow & {
  central_stress_prescribed?: number | null
  peripheral_stress_prescribed?: number | null
  total_stress_prescribed?: number | null
  impulse_prescribed?: number | null
  impulse_actual?: number | null
}

interface SessionRow {
  id: string
  block_id: string | null
  week_in_block: number | null
  scheduled_date: string
  sets: SetWithExtras[]
}

/** Calcule la valeur d'une métrique pour un set unique. */
function setMetricValue(s: SetWithExtras, metric: BoundsMetric): number {
  const wa = s.weight_actual_kg ?? s.weight_prescribed_kg ?? 0
  const ra = s.reps_actual ?? s.reps_prescribed ?? 0
  switch (metric) {
    case 'tonnage':
      return wa * ra
    case 'impulse': {
      const e1rm = s.e1rm_kg ?? 0
      if (e1rm > 0 && wa > 0) return wa * ra * (wa / e1rm)
      return s.impulse_actual ?? s.impulse_prescribed ?? 0
    }
    case 'cs':
      return s.central_stress ?? s.central_stress_prescribed ?? 0
    case 'ps':
      return s.peripheral_stress ?? s.peripheral_stress_prescribed ?? 0
    case 'ts':
      return s.total_stress ?? s.total_stress_prescribed ?? 0
    case 'nl':
      return 1
  }
}

interface WeeklyAgg {
  metric: Record<BoundsMetric, number>
  e1rmMax: number
}

/** Indexe les agrégats hebdo par (block_id → week_in_block → category → WeeklyAgg). */
type WeeklyIndex = Record<string, Record<number, Record<MovementCategory, WeeklyAgg>>>

function emptyAgg(): WeeklyAgg {
  return {
    metric: { tonnage: 0, impulse: 0, cs: 0, ps: 0, ts: 0, nl: 0 },
    e1rmMax: 0,
  }
}

function aggregateSessions(sessions: SessionRow[]): WeeklyIndex {
  const idx: WeeklyIndex = {}
  for (const sess of sessions) {
    if (!sess.block_id || !sess.week_in_block) continue
    const bIdx = (idx[sess.block_id] ??= {})
    const wIdx = (bIdx[sess.week_in_block] ??= {} as Record<MovementCategory, WeeklyAgg>)
    for (const s of sess.sets) {
      const cat = guessCategory(s.exercise_name || '')
      const agg = (wIdx[cat] ??= emptyAgg())
      for (const m of BOUNDS_METRICS) {
        agg.metric[m] += setMetricValue(s, m)
      }
      const e1rm = s.e1rm_kg ?? 0
      if (e1rm > agg.e1rmMax) agg.e1rmMax = e1rm
    }
  }
  return idx
}

/** Combine plusieurs agrégats de catégories en un seul (pour les filtres groupants). */
function combineAggs(aggs: WeeklyAgg[]): WeeklyAgg {
  const out = emptyAgg()
  for (const a of aggs) {
    for (const m of BOUNDS_METRICS) out.metric[m] += a.metric[m]
    if (a.e1rmMax > out.e1rmMax) out.e1rmMax = a.e1rmMax
  }
  return out
}

interface BlockInfo {
  id: string
  start_date: string
}

/**
 * Calcule les bornes pour un athlète donné en s'appuyant sur ses 3 derniers blocs.
 *
 * @param supabase - client Supabase (server-side)
 * @param athleteId - profile id de l'athlète
 * @param chronicByMetric - fallback chronique (depuis /metrics) si historique insuffisant
 */
export async function computeBounds(
  supabase: SupabaseClient,
  athleteId: string,
  chronicByMetric: Partial<Record<BoundsMetric, number>>,
): Promise<BoundsResponse> {
  // 1) Récupère les 3 derniers blocs (par start_date desc)
  const { data: blocks } = await supabase
    .from('blocks')
    .select('id, start_date')
    .eq('athlete_id', athleteId)
    .order('start_date', { ascending: false })
    .limit(3)

  const blockList: BlockInfo[] = (blocks ?? []) as BlockInfo[]

  let weekly: WeeklyIndex = {}
  if (blockList.length > 0) {
    const blockIds = blockList.map(b => b.id)
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, block_id, week_in_block, scheduled_date, sets(*)')
      .in('block_id', blockIds)
    weekly = aggregateSessions(((sessions ?? []) as unknown) as SessionRow[])
  }

  // 2) Pour chaque filtre catégorie × métrique, on calcule MIN/MAX
  const result = {} as BoundsResponse
  for (const filter of Object.keys(CATEGORY_FILTER_MAP) as CategoryFilter[]) {
    const cats = CATEGORY_FILTER_MAP[filter]
    const metricMap = {} as Record<BoundsMetric, BoundsValue>

    for (const metric of BOUNDS_METRICS) {
      const progressionSet: number[] = []
      const regressionSet: number[] = []

      // Parcours bloc par bloc, paires (W, W+1) consécutives
      for (const block of blockList) {
        const blockData = weekly[block.id]
        if (!blockData) continue
        const weeksSorted = Object.keys(blockData)
          .map(Number)
          .sort((a, b) => a - b)
        for (let i = 0; i < weeksSorted.length - 1; i++) {
          const w = weeksSorted[i]
          const wNext = weeksSorted[i + 1]
          if (wNext !== w + 1) continue // semaines non consécutives → on saute

          // Combine les catégories du filtre pour la semaine W et W+1
          const aggsW = cats.map(c => blockData[w]?.[c]).filter(Boolean) as WeeklyAgg[]
          const aggsNext = cats.map(c => blockData[wNext]?.[c]).filter(Boolean) as WeeklyAgg[]
          if (aggsW.length === 0 || aggsNext.length === 0) continue

          const aggW = combineAggs(aggsW)
          const aggNext = combineAggs(aggsNext)

          if (aggW.e1rmMax <= 0 || aggNext.e1rmMax <= 0) continue

          const delta = aggNext.e1rmMax - aggW.e1rmMax
          const epsilon = Math.max(0.5, aggW.e1rmMax * 0.01)
          const value = aggW.metric[metric]
          if (value <= 0) continue

          if (delta > epsilon) progressionSet.push(value)
          else if (delta < -epsilon) regressionSet.push(value)
        }
      }

      // Bornes calculées
      const chronic = chronicByMetric[metric] ?? 0
      let min = progressionSet.length > 0 ? Math.min(...progressionSet) : 0
      let max = regressionSet.length > 0 ? Math.max(...regressionSet) : 0
      let fallback = false

      if (progressionSet.length === 0 && regressionSet.length === 0) {
        // Fallback total : chronique × 1.0 / 1.3
        min = chronic
        max = chronic * 1.3
        fallback = true
      } else if (progressionSet.length === 0) {
        // Pas de progression observée : on utilise chronique pour min
        min = chronic > 0 ? chronic : max * 0.7
        fallback = true
      } else if (regressionSet.length === 0) {
        // Pas de régression observée : on étend max à partir du progression set
        max = Math.max(...progressionSet) * 1.3
        fallback = true
      }

      if (min >= max && max > 0) {
        // Sanity : si bornes inversées, on swap
        const tmp = min
        min = max
        max = tmp * 1.3
        fallback = true
      }

      metricMap[metric] = {
        min,
        max,
        fallback,
        n_progression: progressionSet.length,
        n_regression: regressionSet.length,
      }
    }

    result[filter] = metricMap
  }

  return result
}
