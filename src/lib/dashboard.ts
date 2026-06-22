import type { DailyTracker, Set } from '@/types/database'
import { calculateEffectSize, classifyEffectSize, type EffectSizeMagnitude } from '@/lib/load-management'

export type AlertLevel = 'red' | 'orange' | 'green' | 'gray'

export interface AthleteAlert {
  type: string
  message: string
  level: AlertLevel
}

export interface E1rmTrend {
  lift: string
  value: number | null
  trend: 'up' | 'down' | 'stable' | 'none'
  effectSize: EffectSizeMagnitude | null
}

export function computeAlerts(trackers: DailyTracker[]): AthleteAlert[] {
  const alerts: AthleteAlert[] = []
  const last3 = trackers.slice(0, 3)
  const last4 = trackers.slice(0, 4)

  // Fatigue générale ≥4 sur 3 jours consécutifs → orange
  if (last3.length === 3 && last3.every(t => (t.general_fatigue ?? 0) >= 4)) {
    alerts.push({ type: 'fatigue', message: 'Fatigue générale ≥4 sur 3 jours', level: 'orange' })
  }

  // Motivation <2 sur 3–4 jours → rouge
  const lowMotivation = last4.filter(t => t.motivation != null && t.motivation < 2)
  if (lowMotivation.length >= 3) {
    alerts.push({ type: 'motivation', message: 'Motivation très faible depuis 3+ jours', level: 'red' })
  }

  // Récupération <3 → signal
  if (last3.length > 0 && last3[0].recovery != null && last3[0].recovery < 3) {
    alerts.push({ type: 'recovery', message: 'Récupération insuffisante (< 3)', level: 'orange' })
  }

  // Sommeil qualité <6
  if (last3.length > 0 && last3[0].sleep_quality != null && last3[0].sleep_quality < 6) {
    alerts.push({ type: 'sleep', message: `Qualité sommeil : ${last3[0].sleep_quality}/10`, level: 'orange' })
  }

  // Poids de corps Δ>2% sur 3 jours
  const withBw = last3.filter(t => t.bodyweight_kg != null)
  if (withBw.length >= 2) {
    const newest = withBw[0].bodyweight_kg!
    const oldest = withBw[withBw.length - 1].bodyweight_kg!
    const delta = Math.abs((newest - oldest) / oldest) * 100
    if (delta > 2) {
      alerts.push({ type: 'bodyweight', message: `Poids de corps : Δ${delta.toFixed(1)}% en 3 jours`, level: 'orange' })
    }
  }

  return alerts
}

export function computeAthleteStatus(alerts: AthleteAlert[]): AlertLevel {
  if (alerts.some(a => a.level === 'red')) return 'red'
  if (alerts.some(a => a.level === 'orange')) return 'orange'
  return 'green'
}

export function computeE1rmTrends(sets: Set[]): E1rmTrend[] {
  const lifts = ['Squat', 'Bench', 'Deadlift']

  return lifts.map(lift => {
    // On cherche les sets dont le nom d'exercice contient le lift (insensible à la casse)
    const liftSets = sets
      .filter(s => s.exercise_name.toLowerCase().includes(lift.toLowerCase()) && s.e1rm_kg != null)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    if (liftSets.length === 0) return { lift, value: null, trend: 'none', effectSize: null }

    const recent = liftSets.slice(0, 3)
    const older = liftSets.slice(3, 6)

    const avgRecent = recent.reduce((s, r) => s + r.e1rm_kg!, 0) / recent.length
    const avgOlder = older.length > 0
      ? older.reduce((s, r) => s + r.e1rm_kg!, 0) / older.length
      : null

    let trend: E1rmTrend['trend'] = 'stable'
    if (avgOlder != null) {
      const diff = ((avgRecent - avgOlder) / avgOlder) * 100
      if (diff > 2) trend = 'up'
      else if (diff < -2) trend = 'down'
    } else {
      trend = 'stable'
    }

    let effectSize: EffectSizeMagnitude | null = null
    if (avgOlder != null) {
      const window = liftSets.slice(0, 12).map(s => s.e1rm_kg!)
      const mean = window.reduce((a, b) => a + b, 0) / window.length
      const std = Math.sqrt(window.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / window.length)
      const d = calculateEffectSize(avgRecent, avgOlder, std)
      effectSize = d != null ? classifyEffectSize(d) : null
    }

    return { lift, value: Math.round(avgRecent), trend, effectSize }
  })
}

export function computeFatigueScore(trackers: DailyTracker[]): number | null {
  const last7 = trackers.slice(0, 7).filter(t => t.general_fatigue != null)
  if (last7.length === 0) return null
  const avg = last7.reduce((s, t) => s + t.general_fatigue!, 0) / last7.length
  return Math.round(avg * 10) / 10
}

export function latestBodyweight(trackers: DailyTracker[]): number | null {
  return trackers.find(t => t.bodyweight_kg != null)?.bodyweight_kg ?? null
}

export interface PerformanceAlert {
  exercise_name: string
  type: 'weight_too_low' | 'weight_too_high' | 'rpe_too_high' | 'rpe_too_low' | 'missed_reps'
  prescribed: number | null
  actual: number | null
  level: AlertLevel
  message: string
}

export function computePerformanceAlerts(sets: Set[]): PerformanceAlert[] {
  const alerts: PerformanceAlert[] = []

  // Grouper les sets par exercice et chercher les écarts
  const setsByExercise = new Map<string, Set[]>()
  for (const set of sets) {
    if (!setsByExercise.has(set.exercise_name)) {
      setsByExercise.set(set.exercise_name, [])
    }
    setsByExercise.get(set.exercise_name)!.push(set)
  }

  for (const [exerciseName, exerciseSets] of Array.from(setsByExercise.entries())) {
    // Chercher les sets avec prescription ET réalisation
    for (const set of exerciseSets) {
      if (!set.weight_prescribed_kg || !set.weight_actual_kg) continue

      // Vérifier l'écart de poids
      const weightDiff = ((set.weight_actual_kg - set.weight_prescribed_kg) / set.weight_prescribed_kg) * 100

      if (weightDiff < -10) {
        // Poids réalisé < 90% du poids prescrit
        alerts.push({
          exercise_name: exerciseName,
          type: 'weight_too_low',
          prescribed: set.weight_prescribed_kg,
          actual: set.weight_actual_kg,
          level: 'orange',
          message: `${exerciseName}: ${set.weight_actual_kg}kg vs ${set.weight_prescribed_kg}kg prescrit (${weightDiff.toFixed(0)}%)`,
        })
      } else if (weightDiff > 15) {
        // Poids réalisé > 115% du poids prescrit
        alerts.push({
          exercise_name: exerciseName,
          type: 'weight_too_high',
          prescribed: set.weight_prescribed_kg,
          actual: set.weight_actual_kg,
          level: 'orange',
          message: `${exerciseName}: ${set.weight_actual_kg}kg vs ${set.weight_prescribed_kg}kg prescrit (${weightDiff.toFixed(0)}%)`,
        })
      }

      // Vérifier l'écart de RPE
      if (set.rpe_prescribed && set.rpe_actual) {
        const rpeDiff = set.rpe_actual - set.rpe_prescribed

        if (rpeDiff > 1) {
          alerts.push({
            exercise_name: exerciseName,
            type: 'rpe_too_high',
            prescribed: set.rpe_prescribed,
            actual: set.rpe_actual,
            level: 'red',
            message: `${exerciseName}: RPE ${set.rpe_actual} vs ${set.rpe_prescribed} prescrit (trop d'effort)`,
          })
        } else if (rpeDiff < -1.5) {
          alerts.push({
            exercise_name: exerciseName,
            type: 'rpe_too_low',
            prescribed: set.rpe_prescribed,
            actual: set.rpe_actual,
            level: 'orange',
            message: `${exerciseName}: RPE ${set.rpe_actual} vs ${set.rpe_prescribed} prescrit (pas assez d'effort)`,
          })
        }
      }

      // Vérifier les reps
      if (set.reps_prescribed && set.reps_actual && set.reps_actual < set.reps_prescribed) {
        alerts.push({
          exercise_name: exerciseName,
          type: 'missed_reps',
          prescribed: set.reps_prescribed,
          actual: set.reps_actual,
          level: 'orange',
          message: `${exerciseName}: ${set.reps_actual} reps vs ${set.reps_prescribed} prescrit`,
        })
      }
    }
  }

  // Limiter à 5 alertes max pour le dashboard
  return alerts.slice(0, 5)
}
