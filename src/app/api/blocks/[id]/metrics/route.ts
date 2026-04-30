import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import type { Set as SetRow } from '@/types/database'

/**
 * GET /api/blocks/[id]/metrics
 *
 * Renvoie pour ce bloc :
 *  - per-week aggregates (tonnage, sets, mean RPE, total CS / PS / TS, sets par muscle group)
 *  - chronic (mean of last 4 weeks de l'athlète, tous blocs confondus, AVANT chaque semaine)
 *  - chronic-vs-acute ratio par semaine (ratio = aigu / chronique)
 *
 * Format :
 *   {
 *     weeks: [
 *       {
 *         week: 1,
 *         tonnage, n_sets, mean_rpe, total_cs, total_ps, total_ts,
 *         by_category: { Squat: n_sets, Hinge: n_sets, ... },
 *         chronic: { tonnage, ts },        // moyenne 4 dernières semaines
 *         ratio: { tonnage, ts }            // aigu / chronique
 *       }, ...
 *     ]
 *   }
 *
 * NB : on calcule sur la prescription (weight_prescribed × reps_prescribed)
 * pour les semaines futures, et sur le réalisé si dispo (cohérence avec le trigger
 * qui peuple central_stress / total_stress dès qu'il y a réalisé).
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

  // Sessions de ce bloc + leurs sets (pour les agrégats actuels)
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, week_in_block, scheduled_date, sets(*)')
    .eq('block_id', id)
    .order('week_in_block', { ascending: true })
  if (error) return ERRORS.SERVER()

  // Pour le chronique : on récupère TOUS les sets de l'athlète des 8 semaines
  // précédant le début du bloc, pour pouvoir calculer "chronique = mean(last 4 weeks)"
  // pour chaque semaine du bloc.
  const blockStart = new Date(block.start_date + 'T00:00:00Z')
  const eightWeeksBefore = new Date(blockStart)
  eightWeeksBefore.setUTCDate(blockStart.getUTCDate() - 8 * 7)
  const fromIso = eightWeeksBefore.toISOString().slice(0, 10)

  const { data: athleteSessions } = await supabase
    .from('sessions')
    .select('id, scheduled_date, sets(*)')
    .eq('athlete_id', block.athlete_id)
    .gte('scheduled_date', fromIso)

  // Agrégats par semaine ISO (yyyy-Www) sur l'historique pour le chronique
  type WeekKey = string // yyyy-Www
  function isoWeekKey(d: Date): WeekKey {
    // Year + ISO week — implémentation simple
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const dayNum = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - dayNum + 3)
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
    const diff = (date.getTime() - firstThursday.getTime()) / 86400000
    const wk = 1 + Math.round(diff / 7)
    return `${date.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`
  }

  function aggregateSets(sets: SetRow[]) {
    let tonnage = 0
    let impulse = 0
    let nSets = 0
    let rpeSum = 0
    let rpeCount = 0
    let cs = 0
    let ps = 0
    let ts = 0
    for (const s of sets) {
      // Tonnage : préfère réalisé, sinon prescription
      const w = s.weight_actual_kg ?? s.weight_prescribed_kg ?? 0
      const r = s.reps_actual ?? s.reps_prescribed ?? 0
      const setTonnage = (w || 0) * (r || 0)
      tonnage += setTonnage
      // Impulse = tonnage × %e1RM  (tonnage coefficienté par l'intensité relative)
      // %e1RM = weight / e1rm  — ne peut être calculé que si e1rm_kg est connu
      const e1rm = s.e1rm_kg
      if (e1rm && e1rm > 0 && w) {
        impulse += setTonnage * (w / e1rm)
      }
      nSets++
      const rpe = s.rpe_actual ?? s.rpe_prescribed
      if (rpe != null) {
        rpeSum += rpe
        rpeCount++
      }
      cs += s.central_stress ?? 0
      ps += s.peripheral_stress ?? 0
      ts += s.total_stress ?? 0
    }
    return {
      tonnage,
      impulse,
      n_sets: nSets,
      mean_rpe: rpeCount ? rpeSum / rpeCount : null,
      total_cs: cs,
      total_ps: ps,
      total_ts: ts,
    }
  }

  // 1) Aggregate per-week historique (athlete-wide) keyed par ISO week
  const histByWeek: Record<WeekKey, ReturnType<typeof aggregateSets>> = {}
  for (const sess of athleteSessions ?? []) {
    const wk = isoWeekKey(new Date(sess.scheduled_date + 'T00:00:00Z'))
    const sets = (((sess as { sets?: unknown }).sets ?? []) as unknown) as SetRow[]
    const agg = aggregateSets(sets)
    const cur = histByWeek[wk] ?? { tonnage: 0, impulse: 0, n_sets: 0, mean_rpe: null as number | null, total_cs: 0, total_ps: 0, total_ts: 0 }
    histByWeek[wk] = {
      tonnage: cur.tonnage + agg.tonnage,
      impulse: cur.impulse + agg.impulse,
      n_sets: cur.n_sets + agg.n_sets,
      mean_rpe: agg.mean_rpe ?? cur.mean_rpe,
      total_cs: cur.total_cs + agg.total_cs,
      total_ps: cur.total_ps + agg.total_ps,
      total_ts: cur.total_ts + agg.total_ts,
    }
  }

  // 2) Aggregate per `week_in_block` pour le bloc courant
  type WeekAgg = ReturnType<typeof aggregateSets> & {
    week: number
    by_category: Record<string, number>
    chronic: { tonnage: number; ts: number }
    ratio: { tonnage: number | null; ts: number | null }
  }
  const weeksMap: Record<number, WeekAgg> = {}

  for (const sess of sessions ?? []) {
    const week = sess.week_in_block ?? 0
    if (!week) continue
    const sets = (((sess as { sets?: unknown }).sets ?? []) as unknown) as SetRow[]
    const a = aggregateSets(sets)
    const w = (weeksMap[week] ??= {
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
    w.tonnage += a.tonnage
    w.impulse += a.impulse
    w.n_sets += a.n_sets
    w.total_cs += a.total_cs
    w.total_ps += a.total_ps
    w.total_ts += a.total_ts
    // Recalcul mean_rpe = moyenne pondérée approx
    if (a.mean_rpe != null) {
      // simple : on stocke somme pondérée par n_sets ; on convertira plus tard
      const prev = w.mean_rpe == null ? 0 : w.mean_rpe * (w.n_sets - a.n_sets)
      const total = prev + a.mean_rpe * a.n_sets
      w.mean_rpe = w.n_sets ? total / w.n_sets : null
    }
    // Catégorisation : groupe par catégorie de mouvement (Squat, Hinge, H-Push, etc.)
    // Combine toutes les variantes d'un même mouvement
    for (const s of sets) {
      const category = guessGroup(s.exercise_name || '')
      w.by_category[category] = (w.by_category[category] ?? 0) + 1
    }
  }

  // 3) Chronique : pour chaque semaine du bloc, mean des 4 semaines précédentes
  // (calendaires) à partir de l'historique de l'athlète.
  const sortedWeeks = Object.values(weeksMap).sort((a, b) => a.week - b.week)

  // mapping week_in_block → calendar week-key (basé sur start_date + (week-1)*7j)
  function calendarWeekKey(weekInBlock: number): WeekKey {
    const d = new Date(blockStart)
    d.setUTCDate(blockStart.getUTCDate() + (weekInBlock - 1) * 7)
    return isoWeekKey(d)
  }

  for (const w of sortedWeeks) {
    const wkKey = calendarWeekKey(w.week)
    // 4 semaines précédentes (calendaire)
    const refDate = new Date(blockStart)
    refDate.setUTCDate(blockStart.getUTCDate() + (w.week - 1) * 7)
    const fourPrev: WeekKey[] = []
    for (let k = 1; k <= 4; k++) {
      const d = new Date(refDate)
      d.setUTCDate(refDate.getUTCDate() - k * 7)
      fourPrev.push(isoWeekKey(d))
    }
    const chronicSamples = fourPrev
      .map(k => histByWeek[k])
      .filter((x): x is NonNullable<typeof x> => x != null)

    if (chronicSamples.length > 0) {
      const tonnageMean =
        chronicSamples.reduce((s, x) => s + x.tonnage, 0) / chronicSamples.length
      const tsMean =
        chronicSamples.reduce((s, x) => s + x.total_ts, 0) / chronicSamples.length
      w.chronic = { tonnage: tonnageMean, ts: tsMean }
      w.ratio = {
        tonnage: tonnageMean > 0 ? w.tonnage / tonnageMean : null,
        ts: tsMean > 0 ? w.total_ts / tsMean : null,
      }
    }
    // (wkKey sert de debug si on veut, sinon on l'ignore)
    void wkKey
  }

  return ok({ weeks: sortedWeeks })
}

/**
 * Heuristique légère pour grouper un nom d'exercice en muscle/pattern.
 * Cohérente avec la lib movement.ts mais simplifiée pour le côté serveur.
 */
function guessGroup(name: string): string {
  const n = (name || '').toLowerCase()
  if (/squat|leg press|lunge|step.up|wall sit|sled push|leg ext|hack/.test(n)) return 'Squat'
  if (/deadlift|hinge|rdl|sdt|good morning|hip thrust|glute|hyper|leg curl|hamstring/.test(n))
    return 'Hinge'
  if (/bench|push up|push-up|push.up|flies|tricep ext/.test(n)) return 'Horizontal Push'
  if (/row|pull(?!.*up)|tirage horiz|inverted/.test(n)) return 'Horizontal Pull'
  if (/ohp|overhead press|military|push press|jerk|landmine press|log press|axle press|shoulder press/.test(n))
    return 'Vertical Push'
  if (/pull[- ]?up|chin[- ]?up|pulldown|pull down|lat pull|atlas|rope/.test(n)) return 'Vertical Pull'
  if (/run|bike|erg|cardio|burpee/.test(n)) return 'Cardio'
  return 'Accessoire'
}
