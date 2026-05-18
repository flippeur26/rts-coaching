import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { guessCategory } from '@/lib/movement'
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
    let tonnagePresc = 0
    let tonnageAct = 0
    let impulsePresc = 0
    let impulseAct = 0
    let nSets = 0
    let rpeSum = 0
    let rpeCount = 0
    let cs = 0
    let ps = 0
    let ts = 0
    let csPresc = 0
    let psPresc = 0
    let tsPresc = 0
    let csAct = 0
    let psAct = 0
    let tsAct = 0
    for (const s of sets) {
      const sx = s as SetRow & {
        central_stress_prescribed?: number | null
        peripheral_stress_prescribed?: number | null
        total_stress_prescribed?: number | null
        impulse_prescribed?: number | null
        impulse_actual?: number | null
      }
      // Tonnage prescrit
      const wp = sx.weight_prescribed_kg ?? 0
      const rp = sx.reps_prescribed ?? 0
      tonnagePresc += (wp || 0) * (rp || 0)
      // Tonnage réalisé
      const wa = sx.weight_actual_kg ?? 0
      const ra = sx.reps_actual ?? 0
      tonnageAct += (wa || 0) * (ra || 0)
      // Tonnage fallback (compat): réalisé sinon prescrit
      const w = sx.weight_actual_kg ?? sx.weight_prescribed_kg ?? 0
      const r = sx.reps_actual ?? sx.reps_prescribed ?? 0
      const setTonnage = (w || 0) * (r || 0)
      tonnage += setTonnage
      // Impulse prescrit / réalisé (depuis colonnes DB si dispo)
      if (sx.impulse_prescribed != null) impulsePresc += sx.impulse_prescribed
      if (sx.impulse_actual != null) impulseAct += sx.impulse_actual
      // Impulse fallback (compat): tonnage × %e1RM
      const e1rm = sx.e1rm_kg
      if (e1rm && e1rm > 0 && w) {
        impulse += setTonnage * (w / e1rm)
      }
      nSets++
      const rpe = sx.rpe_actual ?? sx.rpe_prescribed
      if (rpe != null) {
        rpeSum += rpe
        rpeCount++
      }
      // Stress prescrit
      csPresc += sx.central_stress_prescribed ?? 0
      psPresc += sx.peripheral_stress_prescribed ?? 0
      tsPresc += sx.total_stress_prescribed ?? 0
      // Stress réalisé
      csAct += sx.central_stress ?? 0
      psAct += sx.peripheral_stress ?? 0
      tsAct += sx.total_stress ?? 0
      // Compat (réalisé fallback prescrit)
      cs += sx.central_stress ?? sx.central_stress_prescribed ?? 0
      ps += sx.peripheral_stress ?? sx.peripheral_stress_prescribed ?? 0
      ts += sx.total_stress ?? sx.total_stress_prescribed ?? 0
    }
    return {
      tonnage,
      impulse,
      tonnage_prescribed: tonnagePresc,
      tonnage_actual: tonnageAct,
      impulse_prescribed: impulsePresc,
      impulse_actual: impulseAct,
      n_sets: nSets,
      mean_rpe: rpeCount ? rpeSum / rpeCount : null,
      total_cs: cs,
      total_ps: ps,
      total_ts: ts,
      total_cs_prescribed: csPresc,
      total_ps_prescribed: psPresc,
      total_ts_prescribed: tsPresc,
      total_cs_actual: csAct,
      total_ps_actual: psAct,
      total_ts_actual: tsAct,
    }
  }

  // 1) Aggregate per-week historique (athlete-wide) keyed par ISO week
  const histByWeek: Record<WeekKey, ReturnType<typeof aggregateSets>> = {}
  function emptyAgg(): ReturnType<typeof aggregateSets> {
    return {
      tonnage: 0, impulse: 0,
      tonnage_prescribed: 0, tonnage_actual: 0,
      impulse_prescribed: 0, impulse_actual: 0,
      n_sets: 0, mean_rpe: null as number | null,
      total_cs: 0, total_ps: 0, total_ts: 0,
      total_cs_prescribed: 0, total_ps_prescribed: 0, total_ts_prescribed: 0,
      total_cs_actual: 0, total_ps_actual: 0, total_ts_actual: 0,
    }
  }
  for (const sess of athleteSessions ?? []) {
    const wk = isoWeekKey(new Date(sess.scheduled_date + 'T00:00:00Z'))
    const sets = (((sess as { sets?: unknown }).sets ?? []) as unknown) as SetRow[]
    const agg = aggregateSets(sets)
    const cur = histByWeek[wk] ?? emptyAgg()
    histByWeek[wk] = {
      tonnage: cur.tonnage + agg.tonnage,
      impulse: cur.impulse + agg.impulse,
      tonnage_prescribed: cur.tonnage_prescribed + agg.tonnage_prescribed,
      tonnage_actual: cur.tonnage_actual + agg.tonnage_actual,
      impulse_prescribed: cur.impulse_prescribed + agg.impulse_prescribed,
      impulse_actual: cur.impulse_actual + agg.impulse_actual,
      n_sets: cur.n_sets + agg.n_sets,
      mean_rpe: agg.mean_rpe ?? cur.mean_rpe,
      total_cs: cur.total_cs + agg.total_cs,
      total_ps: cur.total_ps + agg.total_ps,
      total_ts: cur.total_ts + agg.total_ts,
      total_cs_prescribed: cur.total_cs_prescribed + agg.total_cs_prescribed,
      total_ps_prescribed: cur.total_ps_prescribed + agg.total_ps_prescribed,
      total_ts_prescribed: cur.total_ts_prescribed + agg.total_ts_prescribed,
      total_cs_actual: cur.total_cs_actual + agg.total_cs_actual,
      total_ps_actual: cur.total_ps_actual + agg.total_ps_actual,
      total_ts_actual: cur.total_ts_actual + agg.total_ts_actual,
    }
  }

  // 2) Aggregate per `week_in_block` pour le bloc courant
  type RatioSet = {
    tonnage: number | null
    impulse: number | null
    cs: number | null
    ps: number | null
    ts: number | null
  }
  type CategoryMetrics = {
    cs: number
    ps: number
    impulse: number
    n_sets: number
    tonnage: number
  }
  type WeekAgg = ReturnType<typeof aggregateSets> & {
    week: number
    by_category: Record<string, number>
    stress_by_category: Record<string, CategoryMetrics>
    chronic: { tonnage: number; ts: number; impulse: number; cs: number; ps: number }
    /** ratio aigu/chronique global — gardé pour compat (basé sur tonnage/impulse/stress fallback) */
    ratio: RatioSet
    /** ratio aigu/chronique côté prescrit */
    ratio_prescribed: RatioSet
    /** ratio aigu/chronique côté réalisé */
    ratio_actual: RatioSet
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
    w.tonnage += a.tonnage
    w.impulse += a.impulse
    w.tonnage_prescribed += a.tonnage_prescribed
    w.tonnage_actual += a.tonnage_actual
    w.impulse_prescribed += a.impulse_prescribed
    w.impulse_actual += a.impulse_actual
    w.n_sets += a.n_sets
    w.total_cs += a.total_cs
    w.total_ps += a.total_ps
    w.total_ts += a.total_ts
    w.total_cs_prescribed += a.total_cs_prescribed
    w.total_ps_prescribed += a.total_ps_prescribed
    w.total_ts_prescribed += a.total_ts_prescribed
    w.total_cs_actual += a.total_cs_actual
    w.total_ps_actual += a.total_ps_actual
    w.total_ts_actual += a.total_ts_actual
    // Recalcul mean_rpe = moyenne pondérée approx
    if (a.mean_rpe != null) {
      // simple : on stocke somme pondérée par n_sets ; on convertira plus tard
      const prev = w.mean_rpe == null ? 0 : w.mean_rpe * (w.n_sets - a.n_sets)
      const total = prev + a.mean_rpe * a.n_sets
      w.mean_rpe = w.n_sets ? total / w.n_sets : null
    }
    // Catégorisation : groupe par catégorie de mouvement (Squat, Hinge, H-Push, etc.)
    for (const s of sets) {
      const sx = s as SetRow & {
        central_stress_prescribed?: number | null
        peripheral_stress_prescribed?: number | null
        impulse_actual?: number | null
        impulse_prescribed?: number | null
      }
      const category = guessCategory(s.exercise_name || '')
      w.by_category[category] = (w.by_category[category] ?? 0) + 1
      const cat = (w.stress_by_category[category] ??= { cs: 0, ps: 0, impulse: 0, n_sets: 0, tonnage: 0 })
      cat.n_sets++
      cat.cs += sx.central_stress ?? sx.central_stress_prescribed ?? 0
      cat.ps += sx.peripheral_stress ?? sx.peripheral_stress_prescribed ?? 0
      const e1rm = sx.e1rm_kg
      const wt = sx.weight_actual_kg ?? sx.weight_prescribed_kg ?? 0
      const rp = sx.reps_actual ?? sx.reps_prescribed ?? 0
      const setTon = wt * rp
      cat.tonnage += setTon
      if (e1rm && e1rm > 0 && wt) {
        cat.impulse += setTon * (wt / e1rm)
      } else {
        cat.impulse += sx.impulse_actual ?? sx.impulse_prescribed ?? 0
      }
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
      const n = chronicSamples.length
      const mean = (key: keyof typeof chronicSamples[number]) =>
        (chronicSamples.reduce((s, x) => s + (x[key] as number), 0) / n) as number
      const tonnageMean = mean('tonnage')
      const tsMean = mean('total_ts')
      const impulseMean = mean('impulse')
      const csMean = mean('total_cs')
      const psMean = mean('total_ps')
      w.chronic = {
        tonnage: tonnageMean,
        ts: tsMean,
        impulse: impulseMean,
        cs: csMean,
        ps: psMean,
      }
      w.ratio = {
        tonnage: tonnageMean > 0 ? w.tonnage / tonnageMean : null,
        impulse: impulseMean > 0 ? w.impulse / impulseMean : null,
        cs: csMean > 0 ? w.total_cs / csMean : null,
        ps: psMean > 0 ? w.total_ps / psMean : null,
        ts: tsMean > 0 ? w.total_ts / tsMean : null,
      }
      // Ratios séparés prescrit / réalisé (vs même chronique = historique réalisé)
      const tonPMean = mean('tonnage_prescribed')
      const tonAMean = mean('tonnage_actual')
      const impPMean = mean('impulse_prescribed')
      const impAMean = mean('impulse_actual')
      const csPMean = mean('total_cs_prescribed')
      const csAMean = mean('total_cs_actual')
      const psPMean = mean('total_ps_prescribed')
      const psAMean = mean('total_ps_actual')
      const tsPMean = mean('total_ts_prescribed')
      const tsAMean = mean('total_ts_actual')
      w.ratio_prescribed = {
        tonnage: tonPMean > 0 ? w.tonnage_prescribed / tonPMean : null,
        impulse: impPMean > 0 ? w.impulse_prescribed / impPMean : null,
        cs: csPMean > 0 ? w.total_cs_prescribed / csPMean : null,
        ps: psPMean > 0 ? w.total_ps_prescribed / psPMean : null,
        ts: tsPMean > 0 ? w.total_ts_prescribed / tsPMean : null,
      }
      w.ratio_actual = {
        tonnage: tonAMean > 0 ? w.tonnage_actual / tonAMean : null,
        impulse: impAMean > 0 ? w.impulse_actual / impAMean : null,
        cs: csAMean > 0 ? w.total_cs_actual / csAMean : null,
        ps: psAMean > 0 ? w.total_ps_actual / psAMean : null,
        ts: tsAMean > 0 ? w.total_ts_actual / tsAMean : null,
      }
    }
    // (wkKey sert de debug si on veut, sinon on l'ignore)
    void wkKey
  }

  return ok({ weeks: sortedWeeks })
}
