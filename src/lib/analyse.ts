import type { Block, Session, Set } from '@/types/database'

export interface WeekStats {
  week: number
  e1rm_squat: number | null
  e1rm_bench: number | null
  e1rm_deadlift: number | null
  volume_squat: number
  volume_bench: number
  volume_deadlift: number
  volume_total: number
  avg_rpe: number | null
  central_stress: number
  peripheral_stress: number
  total_stress: number
}

export interface BlockAnalysis {
  block: Block
  weeks: WeekStats[]
}

const LIFT_KEYWORDS: Record<string, string[]> = {
  squat: ['squat', 'sq'],
  bench: ['bench', 'bp', 'développé'],
  deadlift: ['deadlift', 'dl', 'soulevé'],
}

function detectLift(name: string): 'squat' | 'bench' | 'deadlift' | null {
  const lower = name.toLowerCase()
  for (const [lift, keywords] of Object.entries(LIFT_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) {
      return lift as 'squat' | 'bench' | 'deadlift'
    }
  }
  return null
}

function maxE1rm(sets: Set[], lift: string): number | null {
  const vals = sets
    .filter(s => detectLift(s.exercise_name) === lift && s.e1rm_kg != null)
    .map(s => s.e1rm_kg!)
  return vals.length > 0 ? Math.max(...vals) : null
}

function sumVolume(sets: Set[], lift: string): number {
  return sets
    .filter(s => detectLift(s.exercise_name) === lift && s.volume_load_kg != null)
    .reduce((sum, s) => sum + s.volume_load_kg!, 0)
}

function avgRpe(sets: Set[]): number | null {
  const vals = sets.filter(s => s.rpe_actual != null).map(s => s.rpe_actual!)
  if (vals.length === 0) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

export function analyseBlock(
  block: Block,
  sessions: Session[],
  setsBySession: Record<string, Set[]>
): BlockAnalysis {
  const totalWeeks = block.total_weeks ?? 4

  const weeks: WeekStats[] = Array.from({ length: totalWeeks }, (_, i) => {
    const weekNum = i + 1
    const weekSessions = sessions.filter(s => s.week_in_block === weekNum)
    const sets = weekSessions.flatMap(s => setsBySession[s.id] ?? [])

    return {
      week: weekNum,
      e1rm_squat: maxE1rm(sets, 'squat'),
      e1rm_bench: maxE1rm(sets, 'bench'),
      e1rm_deadlift: maxE1rm(sets, 'deadlift'),
      volume_squat: sumVolume(sets, 'squat'),
      volume_bench: sumVolume(sets, 'bench'),
      volume_deadlift: sumVolume(sets, 'deadlift'),
      volume_total: sets.reduce((sum, s) => sum + (s.volume_load_kg ?? 0), 0),
      avg_rpe: avgRpe(sets),
      central_stress: sets.reduce((sum, s) => sum + (s.central_stress ?? 0), 0),
      peripheral_stress: sets.reduce((sum, s) => sum + (s.peripheral_stress ?? 0), 0),
      total_stress: sets.reduce((sum, s) => sum + (s.total_stress ?? 0), 0),
    }
  })

  return { block, weeks }
}
