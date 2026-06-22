import { startOfWeek, format } from 'date-fns'
import type { Session, Set as SetRow } from '@/types/database'

/**
 * Indicateurs de gestion de charge issus de METRICS_REFERENCE.md (Parties 3.5, 3.6, 3.7, 4) :
 * Ratio Acute:Chronic, rCXL, Monotonie/Strain (Foster), Volume Landmarks (MEV/MAV/MRV),
 * Effect Size, Normalized Volume. Toutes les fonctions sont pures et opèrent directement
 * sur les lignes Supabase (Session/Set), sans table daily_loads/weekly_volume dédiée —
 * les fenêtres glissantes sont dérivées à la volée depuis l'historique déjà persisté.
 *
 * Les paramètres n'exigent que les colonnes effectivement lues (Pick), pour accepter
 * aussi bien les lignes complètes que les SELECT partiels utilisés sur les fenêtres longues.
 */

export type SessionLite = Pick<Session, 'id' | 'scheduled_date'>
export type SetLite = Pick<SetRow, 'session_id' | 'exercise_name' | 'weight_actual_kg' | 'reps_actual' | 'e1rm_kg'>

export type Lift = 'Squat' | 'Bench' | 'Deadlift'
export const LIFTS: Lift[] = ['Squat', 'Bench', 'Deadlift']

function matchesLift(exerciseName: string, lift: Lift): boolean {
  return exerciseName.toLowerCase().includes(lift.toLowerCase())
}

interface DailyStat {
  date: string // yyyy-MM-dd
  ts: number
  ari: number | null
}

// Construit la charge quotidienne (TS = TTL_VOL × ARI) et l'ARI pour un mouvement
// (ou tous mouvements si liftFilter est omis). Seuls les sets réalisés (poids + reps
// actuels présents) comptent — les sets futurs/non réalisés ne contribuent pas à l'historique.
function buildDailyStats(sessions: SessionLite[], sets: SetLite[], liftFilter?: Lift): DailyStat[] {
  const dateBySession = new Map(sessions.map(s => [s.id, s.scheduled_date.slice(0, 10)]))
  const byDate = new Map<string, SetLite[]>()

  for (const set of sets) {
    if (liftFilter && !matchesLift(set.exercise_name, liftFilter)) continue
    if (set.weight_actual_kg == null || set.reps_actual == null) continue
    const date = dateBySession.get(set.session_id)
    if (!date) continue
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date)!.push(set)
  }

  const stats: DailyStat[] = []
  for (const [date, daySets] of Array.from(byDate.entries())) {
    const NL = daySets.reduce((sum, s) => sum + s.reps_actual!, 0)
    const TTL_VOL = daySets.reduce((sum, s) => sum + s.weight_actual_kg! * s.reps_actual!, 0)
    const AI = NL > 0 ? TTL_VOL / NL : 0
    const e1rmDay = daySets.reduce((max, s) => (s.e1rm_kg != null && s.e1rm_kg > max ? s.e1rm_kg : max), 0)
    const ari = e1rmDay > 0 && AI > 0 ? AI / e1rmDay : null
    const ts = ari != null ? TTL_VOL * ari : 0
    stats.push({ date, ts, ari })
  }
  return stats
}

// Fenêtre glissante de windowDays jours se terminant à referenceDate (incluse).
// Les jours sans donnée comptent 0 (TS) / null (ARI) — jamais exclus (règle non-négociable).
function windowValues(stats: DailyStat[], referenceDate: Date, windowDays: number): { ts: number[]; ari: (number | null)[] } {
  const byDate = new Map(stats.map(s => [s.date, s]))
  const ts: number[] = []
  const ari: (number | null)[] = []
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(referenceDate)
    d.setDate(referenceDate.getDate() - i)
    const key = format(d, 'yyyy-MM-dd')
    const found = byDate.get(key)
    ts.push(found?.ts ?? 0)
    ari.push(found?.ari ?? null)
  }
  return { ts, ari }
}

// ---------------------------------------------------------------------------
// 3.5 — Normalized Volume
// ---------------------------------------------------------------------------

export function calculateNormalizedVolume(NL: number, ARI: number): number {
  return NL * ARI * 100
}

// ---------------------------------------------------------------------------
// Partie 4 — Ratio Acute:Chronic
// ---------------------------------------------------------------------------

export type ACZone = 'undertrained' | 'optimal' | 'attention' | 'danger'

export function classifyRatioAC(ratio: number): ACZone {
  if (ratio < 0.8) return 'undertrained'
  if (ratio <= 1.3) return 'optimal'
  if (ratio <= 1.5) return 'attention'
  return 'danger'
}

export interface AcuteChronicResult {
  lift: Lift
  acute: number | null
  chronic: number | null
  ratio: number | null
  zone: ACZone | null
}

export function computeAcuteChronicRatios(
  sessions: SessionLite[],
  sets: SetLite[],
  referenceDate: Date = new Date(),
  lifts: Lift[] = LIFTS,
): AcuteChronicResult[] {
  return lifts.map(lift => {
    const stats = buildDailyStats(sessions, sets, lift)
    if (stats.length === 0) return { lift, acute: null, chronic: null, ratio: null, zone: null }

    const { ts: acuteWindow } = windowValues(stats, referenceDate, 7)
    const { ts: chronicWindow } = windowValues(stats, referenceDate, 28)

    const acute = acuteWindow.reduce((a, b) => a + b, 0) / 7
    const nonZeroDays = chronicWindow.filter(v => v > 0).length
    const chronic = nonZeroDays < 3 ? null : chronicWindow.reduce((a, b) => a + b, 0) / 28
    const ratio = chronic != null && chronic !== 0 ? acute / chronic : null

    return { lift, acute, chronic, ratio, zone: ratio != null ? classifyRatioAC(ratio) : null }
  })
}

// ---------------------------------------------------------------------------
// 3.6 — rCXL (badge "estimation" requis dans l'UI — confiance ★★)
// ---------------------------------------------------------------------------

export const RCXL_THRESHOLDS = { PEAK: 1.1, NORMAL_LOW: 0.9, NORMAL_HIGH: 1.1 }
export type RcxlZone = 'peak' | 'normal' | 'light'

export function classifyRCXL(rcxl: number): RcxlZone {
  if (rcxl > RCXL_THRESHOLDS.PEAK) return 'peak'
  if (rcxl < RCXL_THRESHOLDS.NORMAL_LOW) return 'light'
  return 'normal'
}

export interface RcxlResult {
  lift: Lift
  rcxl: number | null
  zone: RcxlZone | null
  sessionDate: string | null
}

export function computeRCXL(
  sessions: SessionLite[],
  sets: SetLite[],
  referenceDate: Date = new Date(),
  lifts: Lift[] = LIFTS,
): RcxlResult[] {
  return lifts.map(lift => {
    const stats = buildDailyStats(sessions, sets, lift)
    if (stats.length === 0) return { lift, rcxl: null, zone: null, sessionDate: null }

    const latest = [...stats].sort((a, b) => b.date.localeCompare(a.date))[0]
    if (latest.ari == null) return { lift, rcxl: null, zone: null, sessionDate: latest.date }

    const { ari: ariWindow } = windowValues(stats, new Date(latest.date), 28)
    const validAri = ariWindow.filter((v): v is number => v != null)
    if (validAri.length < 3) return { lift, rcxl: null, zone: null, sessionDate: latest.date }

    const chronicARI = validAri.reduce((a, b) => a + b, 0) / validAri.length
    if (chronicARI === 0) return { lift, rcxl: null, zone: null, sessionDate: latest.date }

    const rcxl = latest.ari / chronicARI
    return { lift, rcxl, zone: classifyRCXL(rcxl), sessionDate: latest.date }
  })
}

// ---------------------------------------------------------------------------
// Partie 4 — Monotonie & Strain (Foster) — charge journalière tous mouvements
// ---------------------------------------------------------------------------

export function calculateMonotony(weekLoads: number[]): number {
  const mean = weekLoads.reduce((a, b) => a + b, 0) / weekLoads.length
  const variance = weekLoads.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / weekLoads.length
  const std = Math.sqrt(variance)
  return std === 0 ? 1 : mean / std
}

export function calculateStrain(weekLoads: number[]): number {
  const total = weekLoads.reduce((a, b) => a + b, 0)
  return total * calculateMonotony(weekLoads)
}

export type MonotonyZone = 'good' | 'attention' | 'alarm'

export function classifyMonotony(monotony: number): MonotonyZone {
  if (monotony < 1.5) return 'good'
  if (monotony <= 2.0) return 'attention'
  return 'alarm'
}

export interface MonotonyStrainResult {
  monotony: number | null
  strain: number | null
  zone: MonotonyZone | null
  daysOfData: number
}

export function computeMonotonyStrain(
  sessions: SessionLite[],
  sets: SetLite[],
  referenceDate: Date = new Date(),
): MonotonyStrainResult {
  const stats = buildDailyStats(sessions, sets)
  const { ts: weekLoads } = windowValues(stats, referenceDate, 7)
  const total = weekLoads.reduce((a, b) => a + b, 0)
  if (total === 0) return { monotony: null, strain: null, zone: null, daysOfData: 0 }

  const monotony = calculateMonotony(weekLoads)
  const strain = calculateStrain(weekLoads)
  const daysOfData = weekLoads.filter(v => v > 0).length

  return { monotony, strain, zone: classifyMonotony(monotony), daysOfData }
}

// ---------------------------------------------------------------------------
// Effect Size (Partie 4 fin) — Cohen's d simplifié
// ---------------------------------------------------------------------------

export function calculateEffectSize(
  currentValue: number,
  previousValue: number,
  historicalStd: number,
): number | null {
  if (historicalStd === 0) return null
  return (currentValue - previousValue) / historicalStd
}

export type EffectSizeMagnitude = 'trivial' | 'small' | 'moderate' | 'large'

export function classifyEffectSize(d: number): EffectSizeMagnitude {
  const abs = Math.abs(d)
  if (abs < 0.2) return 'trivial'
  if (abs < 0.5) return 'small'
  if (abs < 0.8) return 'moderate'
  return 'large'
}

// ---------------------------------------------------------------------------
// 3.7 — Volume Landmarks individuels (MEV/MAV/MRV) + fallback générique (Partie 5.1)
// ---------------------------------------------------------------------------

export const VOLUME_LANDMARKS: Record<Lift, { mev: [number, number]; mav: [number, number]; mrv: [number, number] }> = {
  Squat: { mev: [6, 8], mav: [10, 14], mrv: [16, 20] },
  Bench: { mev: [8, 10], mav: [12, 16], mrv: [18, 22] },
  Deadlift: { mev: [4, 6], mav: [6, 10], mrv: [12, 16] },
}

export type PerformanceTrend = 'progressing' | 'stagnant' | 'regressing'

export function classifyTrend(
  currentE1RM: number | null,
  previousE1RM: number | null,
  thresholdKg = 0.5,
): PerformanceTrend | null {
  if (currentE1RM == null || previousE1RM == null) return null
  const delta = currentE1RM - previousE1RM
  if (delta > thresholdKg) return 'progressing'
  if (delta < -thresholdKg) return 'regressing'
  return 'stagnant'
}

function avgRange([min, max]: [number, number]): number {
  return (min + max) / 2
}

export interface WeeklyVolumeData {
  weekStartDate: string
  setsPerWeek: number
  e1RM: number | null
}

export interface VolumeLandmarkEstimate {
  mev: number | null
  mav: number | null
  mrv: number | null
  confidence: 'low' | 'medium' | 'high'
  weeksOfData: number
}

export function estimateVolumeLandmarks(
  history: WeeklyVolumeData[],
  fallback: { mev: [number, number]; mav: [number, number]; mrv: [number, number] },
): VolumeLandmarkEstimate {
  const data = history.filter(h => h.e1RM !== null).sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate))

  if (data.length < 4) {
    return {
      mev: avgRange(fallback.mev),
      mav: avgRange(fallback.mav),
      mrv: avgRange(fallback.mrv),
      confidence: 'low',
      weeksOfData: data.length,
    }
  }

  const progressingWeeks: number[] = []
  let mrvCandidate: number | null = null

  for (let i = 1; i < data.length; i++) {
    const trend = classifyTrend(data[i].e1RM, data[i - 1].e1RM)
    if (trend === 'progressing') {
      progressingWeeks.push(data[i].setsPerWeek)
    } else if (trend === 'stagnant' || trend === 'regressing') {
      if (progressingWeeks.length > 0 && mrvCandidate === null) {
        mrvCandidate = data[i].setsPerWeek
      }
    }
  }

  const mev = progressingWeeks.length > 0 ? Math.min(...progressingWeeks) : avgRange(fallback.mev)
  const mav = progressingWeeks.length > 0 ? Math.max(...progressingWeeks) : avgRange(fallback.mav)
  const mrv = mrvCandidate ?? avgRange(fallback.mrv)

  const confidence: VolumeLandmarkEstimate['confidence'] =
    data.length >= 8 && mrvCandidate !== null ? 'high' : data.length >= 4 ? 'medium' : 'low'

  return { mev, mav, mrv, confidence, weeksOfData: data.length }
}

export interface VolumeLandmarksResult extends VolumeLandmarkEstimate {
  lift: Lift
  currentWeekSets: number
  normalizedVolume: number | null
}

export function computeVolumeLandmarks(
  sessions: SessionLite[],
  sets: SetLite[],
  referenceDate: Date = new Date(),
  lifts: Lift[] = LIFTS,
): VolumeLandmarksResult[] {
  const dateBySession = new Map(sessions.map(s => [s.id, s.scheduled_date.slice(0, 10)]))

  return lifts.map(lift => {
    const liftSets = sets.filter(
      s => matchesLift(s.exercise_name, lift) && dateBySession.has(s.session_id) && s.weight_actual_kg != null && s.reps_actual != null,
    )

    const byWeek = new Map<string, SetLite[]>()
    for (const s of liftSets) {
      const date = dateBySession.get(s.session_id)!
      const weekStart = format(startOfWeek(new Date(date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      if (!byWeek.has(weekStart)) byWeek.set(weekStart, [])
      byWeek.get(weekStart)!.push(s)
    }

    const history: WeeklyVolumeData[] = Array.from(byWeek.entries()).map(([weekStartDate, weekSets]) => ({
      weekStartDate,
      setsPerWeek: weekSets.length,
      e1RM: weekSets.reduce<number | null>((max, s) => (s.e1rm_kg != null && s.e1rm_kg > (max ?? 0) ? s.e1rm_kg : max), null),
    }))

    const estimate = estimateVolumeLandmarks(history, VOLUME_LANDMARKS[lift])

    const currentWeekKey = format(startOfWeek(referenceDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const currentWeekSetsArr = byWeek.get(currentWeekKey) ?? []
    const currentWeekData = history.find(h => h.weekStartDate === currentWeekKey)

    let normalizedVolume: number | null = null
    if (currentWeekData?.e1RM) {
      const NL = currentWeekSetsArr.reduce((sum, s) => sum + (s.reps_actual ?? 0), 0)
      const TTL_VOL = currentWeekSetsArr.reduce((sum, s) => sum + (s.weight_actual_kg ?? 0) * (s.reps_actual ?? 0), 0)
      const AI = NL > 0 ? TTL_VOL / NL : 0
      const ARI = currentWeekData.e1RM > 0 ? AI / currentWeekData.e1RM : null
      normalizedVolume = ARI != null ? calculateNormalizedVolume(NL, ARI) : null
    }

    return { lift, currentWeekSets: currentWeekSetsArr.length, normalizedVolume, ...estimate }
  })
}
