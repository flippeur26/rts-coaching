import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { computeBounds, BOUNDS_METRICS, type BoundsMetric } from '@/lib/bounds-engine'
import type { Set as SetRow } from '@/types/database'

/**
 * GET /api/blocks/[id]/bounds
 *
 * Renvoie les bornes adaptatives min/max par (catégorie filtre, métrique) pour le coach
 * pour afficher des jauges sur l'éditeur de bloc. Voir bounds-engine.ts pour l'algorithme.
 *
 * Format :
 *   { bounds: { [filter]: { tonnage: { min, max, fallback, n_progression, n_regression }, ... } } }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id } = await params

  const { data: block } = await supabase
    .from('blocks')
    .select('id, coach_id, athlete_id, start_date')
    .eq('id', id)
    .single()
  if (!block) return ERRORS.NOT_FOUND('Bloc')
  if (block.coach_id !== user.id && block.athlete_id !== user.id) {
    return ERRORS.FORBIDDEN()
  }

  // Chronique simple : moyenne sur les 4 semaines calendaires précédant le start_date du bloc.
  // Sert de fallback si l'historique sur 3 blocs n'a pas généré assez de paires progression/régression.
  const blockStart = new Date(block.start_date + 'T00:00:00Z')
  const fourWeeksBefore = new Date(blockStart)
  fourWeeksBefore.setUTCDate(blockStart.getUTCDate() - 4 * 7)
  const fromIso = fourWeeksBefore.toISOString().slice(0, 10)
  const toIso = block.start_date

  const { data: histSessions } = await supabase
    .from('sessions')
    .select('id, scheduled_date, sets(*)')
    .eq('athlete_id', block.athlete_id)
    .gte('scheduled_date', fromIso)
    .lt('scheduled_date', toIso)

  type ExtSet = SetRow & {
    central_stress_prescribed?: number | null
    peripheral_stress_prescribed?: number | null
    total_stress_prescribed?: number | null
    impulse_prescribed?: number | null
    impulse_actual?: number | null
  }
  const chronicSum: Record<BoundsMetric, number> = { tonnage: 0, impulse: 0, cs: 0, ps: 0, ts: 0, nl: 0 }
  let weekCount = 0
  // Bucket par semaine ISO
  const buckets = new Map<string, Record<BoundsMetric, number>>()
  for (const sess of histSessions ?? []) {
    const d = new Date(sess.scheduled_date + 'T00:00:00Z')
    // Clé hebdo (lundi du jour)
    const dayNum = (d.getUTCDay() + 6) % 7
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - dayNum)
    const key = monday.toISOString().slice(0, 10)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { tonnage: 0, impulse: 0, cs: 0, ps: 0, ts: 0, nl: 0 }
      buckets.set(key, bucket)
    }
    const sets = (((sess as { sets?: unknown }).sets ?? []) as unknown) as ExtSet[]
    for (const s of sets) {
      const wa = s.weight_actual_kg ?? s.weight_prescribed_kg ?? 0
      const ra = s.reps_actual ?? s.reps_prescribed ?? 0
      const ton = wa * ra
      bucket.tonnage += ton
      const e1rm = s.e1rm_kg ?? 0
      if (e1rm > 0 && wa > 0) bucket.impulse += ton * (wa / e1rm)
      else bucket.impulse += s.impulse_actual ?? s.impulse_prescribed ?? 0
      bucket.cs += s.central_stress ?? s.central_stress_prescribed ?? 0
      bucket.ps += s.peripheral_stress ?? s.peripheral_stress_prescribed ?? 0
      bucket.ts += s.total_stress ?? s.total_stress_prescribed ?? 0
      bucket.nl += 1
    }
  }
  for (const b of Array.from(buckets.values())) {
    for (const m of BOUNDS_METRICS) chronicSum[m] += b[m]
    weekCount++
  }
  const chronicMean: Partial<Record<BoundsMetric, number>> = {}
  if (weekCount > 0) {
    for (const m of BOUNDS_METRICS) chronicMean[m] = chronicSum[m] / weekCount
  }

  const bounds = await computeBounds(supabase, block.athlete_id, chronicMean)
  return ok({ bounds })
}
