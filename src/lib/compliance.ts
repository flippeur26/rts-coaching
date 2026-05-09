import { startOfWeek, endOfWeek, subWeeks, isWithinInterval, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Session, Set as SetRow, DailyTracker } from '@/types/database'

export interface ComplianceData {
  sessions_done_pct: number
  sessions_done: number
  sessions_total: number
  sets_done_pct: number
  weight_compliance_pct: number | null
  reps_compliance_pct: number | null
  avg_rpe_realization_pct: number | null
}

export interface WeeklyCompliance {
  week_label: string
  sets_done_pct: number
}

export interface StagnationResult {
  detected: boolean
  plateaus: Array<{ exercise: string; avg_e1rm: number }>
}

export interface OverreachingResult {
  detected: boolean
}

export function computeCompliance(sessions: Session[], sets: SetRow[]): ComplianceData {
  const setsBySession = new Map<string, SetRow[]>()
  for (const s of sets) {
    if (!setsBySession.has(s.session_id)) setsBySession.set(s.session_id, [])
    setsBySession.get(s.session_id)!.push(s)
  }

  const today = new Date().toISOString().slice(0, 10)

  // Only past/today sessions with ≥1 prescribed set
  const programmedSessions = sessions.filter(sess =>
    sess.scheduled_date <= today &&
    (setsBySession.get(sess.id) ?? []).length > 0
  )

  const sessions_total = programmedSessions.length
  const sessions_done = programmedSessions.filter(sess =>
    (setsBySession.get(sess.id) ?? []).some(s => s.rpe_actual != null)
  ).length

  const sessions_done_pct = sessions_total > 0 ? Math.round((sessions_done / sessions_total) * 100) : 0

  const sets_with_actual = sets.filter(s => s.rpe_actual != null)
  const sets_done_pct = sets.length > 0 ? Math.round((sets_with_actual.length / sets.length) * 100) : 0

  const setsWithWeight = sets_with_actual.filter(s => s.weight_prescribed_kg != null && s.weight_actual_kg != null)
  const weight_compliance_pct = setsWithWeight.length > 0
    ? Math.round((setsWithWeight.filter(s => {
        const diff = Math.abs((s.weight_actual_kg! - s.weight_prescribed_kg!) / s.weight_prescribed_kg!) * 100
        return diff <= 10
      }).length / setsWithWeight.length) * 100)
    : null

  const setsWithReps = sets_with_actual.filter(s => s.reps_prescribed != null && s.reps_actual != null)
  const reps_compliance_pct = setsWithReps.length > 0
    ? Math.round(setsWithReps.filter(s => s.reps_actual! >= s.reps_prescribed!).length / setsWithReps.length * 100)
    : null

  const setsWithRpe = sets_with_actual.filter(s => s.rpe_realization_pct != null)
  const avg_rpe_realization_pct = setsWithRpe.length > 0
    ? Math.round(setsWithRpe.reduce((acc, s) => acc + s.rpe_realization_pct!, 0) / setsWithRpe.length)
    : null

  return {
    sessions_done_pct,
    sessions_done,
    sessions_total,
    sets_done_pct,
    weight_compliance_pct,
    reps_compliance_pct,
    avg_rpe_realization_pct,
  }
}

export function computeWeeklyCompliance(sessions: Session[], sets: SetRow[], weeks = 4): WeeklyCompliance[] {
  const now = new Date()
  const result: WeeklyCompliance[] = []

  for (let i = weeks - 1; i >= 0; i--) {
    const ref = subWeeks(now, i)
    const weekStart = startOfWeek(ref, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(ref, { weekStartsOn: 1 })

    const today = new Date().toISOString().slice(0, 10)

    const weekSessionIds = new Set(
      sessions
        .filter(sess =>
          sess.scheduled_date <= today &&
          isWithinInterval(new Date(sess.scheduled_date), { start: weekStart, end: weekEnd })
        )
        .map(sess => sess.id)
    )

    const weekSets = sets.filter(s => weekSessionIds.has(s.session_id))
    const total = weekSets.length

    // Skip weeks with no programmed sets — no program = not counted
    if (total === 0) continue

    const done = weekSets.filter(s => s.rpe_actual != null).length

    result.push({
      week_label: format(weekStart, 'd MMM', { locale: fr }),
      sets_done_pct: Math.round((done / total) * 100),
    })
  }

  return result
}

export function computeStagnation(sets: SetRow[]): StagnationResult {
  const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000)
  const recentSets = sets.filter(s => s.e1rm_kg != null && new Date(s.created_at) >= threeWeeksAgo)

  // Group by exercise → session, take peak e1RM per session
  // Plateau requires ≥3 DISTINCT sessions, not ≥3 sets in the same session
  const byExerciseSession = new Map<string, Map<string, number>>()
  for (const s of recentSets) {
    if (!byExerciseSession.has(s.exercise_name)) byExerciseSession.set(s.exercise_name, new Map())
    const sessionMap = byExerciseSession.get(s.exercise_name)!
    const prev = sessionMap.get(s.session_id) ?? 0
    if (s.e1rm_kg! > prev) sessionMap.set(s.session_id, s.e1rm_kg!)
  }

  const plateaus: Array<{ exercise: string; avg_e1rm: number }> = []
  for (const [exercise, sessionMap] of Array.from(byExerciseSession.entries())) {
    const values = Array.from(sessionMap.values())
    // Need ≥3 distinct sessions to assess stagnation
    if (values.length < 3) continue
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    const mae = values.reduce((a, b) => a + Math.abs(b - avg), 0) / values.length
    if ((mae / avg) * 100 < 2.5) {
      plateaus.push({ exercise, avg_e1rm: Math.round(avg) })
    }
  }

  return { detected: plateaus.length > 0, plateaus }
}

export function computeOverreachingSignal(trackers: DailyTracker[], sets: SetRow[]): OverreachingResult {
  const now = Date.now()
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000

  const prevFrom = new Date(now - 2 * twoWeeksMs)
  const recentFrom = new Date(now - twoWeeksMs)

  const prevTrackers = trackers.filter(t => { const d = new Date(t.date); return d >= prevFrom && d < recentFrom })
  const recentTrackers = trackers.filter(t => new Date(t.date) >= recentFrom)

  const prevSets = sets.filter(s => { const d = new Date(s.created_at); return d >= prevFrom && d < recentFrom })
  const recentSets = sets.filter(s => new Date(s.created_at) >= recentFrom)

  if (!prevTrackers.length || !recentTrackers.length || !prevSets.length || !recentSets.length) {
    return { detected: false }
  }

  const avg = (vals: number[]) => vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null

  const prevCS = avg(prevSets.map(s => s.central_stress).filter((v): v is number => v != null))
  const recentCS = avg(recentSets.map(s => s.central_stress).filter((v): v is number => v != null))
  const prevE1rm = avg(prevSets.map(s => s.e1rm_kg).filter((v): v is number => v != null))
  const recentE1rm = avg(recentSets.map(s => s.e1rm_kg).filter((v): v is number => v != null))
  const prevFatigue = avg(prevTrackers.map(t => t.general_fatigue).filter((v): v is number => v != null))
  const recentFatigue = avg(recentTrackers.map(t => t.general_fatigue).filter((v): v is number => v != null))

  if (prevCS == null || recentCS == null || prevE1rm == null || recentE1rm == null || prevFatigue == null || recentFatigue == null) {
    return { detected: false }
  }

  return {
    detected: recentCS > prevCS && recentE1rm < prevE1rm * 0.98 && recentFatigue > prevFatigue,
  }
}
