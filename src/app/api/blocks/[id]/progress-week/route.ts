import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'
import { recommendLoad, roundToStep } from '@/lib/rts-calc'

const progressionSchema = z.object({
  source_week: z.number().int().min(1),
  target_week: z.number().int().min(1),
  exercises: z.array(z.string()).min(1),
  field: z.enum(['weight', 'reps', 'rpe', 'sets']),
  type: z.enum(['fixed', 'percent']),
  value: z.number().min(0),
  copy_modifiers: z.boolean().optional(),
  detect_overperformance: z.boolean().optional(),
  apply_to_all_weeks: z.boolean().optional(),
})

type SetRow = {
  id: string
  exercise_name: string | null
  weight_prescribed_kg: number | null
  reps_prescribed: number | null
  rpe_prescribed: number | null
  tempo: string | null
  rom_prescribed: string | null
  exercise_format: string | null
  e1rm_kg: number | null
  rpe_realization_pct: number | null
}

type SessionRow = {
  id: string
  week_in_block: number | null
  sets: SetRow[]
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id: blockId } = await params
  const body = await request.json()
  const parsed = progressionSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  const {
    target_week,
    exercises,
    field,
    type,
    value,
    copy_modifiers = true,
    detect_overperformance = true,
    apply_to_all_weeks = false,
  } = parsed.data

  const { data: block } = await supabase
    .from('blocks')
    .select('id, coach_id, athlete_id')
    .eq('id', blockId)
    .single()
  if (!block) return ERRORS.NOT_FOUND('Bloc')
  if (block.coach_id !== user.id) return ERRORS.FORBIDDEN()

  const { data: allSessions, error: allError } = await supabase
    .from('sessions')
    .select('id, week_in_block, sets(*)')
    .eq('block_id', blockId)
    .order('week_in_block', { ascending: true })

  if (allError) return ERRORS.SERVER()

  const sessionsByWeek = new Map<number, SessionRow[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const session of (allSessions ?? []) as any[] as SessionRow[]) {
    const week = session.week_in_block ?? 0
    if (!sessionsByWeek.has(week)) sessionsByWeek.set(week, [])
    sessionsByWeek.get(week)!.push(session)
  }

  const maxWeek = apply_to_all_weeks
    ? Math.max(...Array.from(sessionsByWeek.keys()))
    : target_week

  const updates: { id: string; [key: string]: unknown }[] = []

  for (let currentWeek = target_week; currentWeek <= maxWeek; currentWeek++) {
    const prevSessions = sessionsByWeek.get(currentWeek - 1) ?? []
    const currSessions = sessionsByWeek.get(currentWeek) ?? []
    if (!prevSessions.length || !currSessions.length) continue

    for (let sessIdx = 0; sessIdx < prevSessions.length; sessIdx++) {
      const prevSession = prevSessions[sessIdx]
      const currSession = currSessions[sessIdx]
      if (!currSession) continue

      const prevSets = prevSession.sets.filter(s => exercises.includes(s.exercise_name ?? ''))
      const currSets = currSession.sets.filter(s => exercises.includes(s.exercise_name ?? ''))

      for (let i = 0; i < prevSets.length; i++) {
        const prevSet = prevSets[i]
        const currSet = currSets[i]
        if (!currSet) continue

        let newValue: number = 0

        if (field === 'weight') {
          const w = prevSet.weight_prescribed_kg ?? 0
          newValue = type === 'fixed' ? w + value : w * (1 + value / 100)
          if (detect_overperformance && (prevSet.rpe_realization_pct ?? 0) > 110) {
            newValue *= 0.8
          }
        } else if (field === 'reps') {
          const r = prevSet.reps_prescribed ?? 0
          newValue = type === 'fixed' ? Math.max(1, r + value) : Math.max(1, Math.round(r * (1 + value / 100)))
        } else if (field === 'rpe') {
          const rpe = prevSet.rpe_prescribed ?? 0
          newValue = type === 'fixed'
            ? Math.min(10, Math.max(5, rpe + value))
            : Math.min(10, Math.max(5, rpe * (1 + value / 100)))
        }

        const updateData: { [key: string]: unknown } = {
          weight_prescribed_kg: prevSet.weight_prescribed_kg,
          reps_prescribed: prevSet.reps_prescribed,
          rpe_prescribed: prevSet.rpe_prescribed,
        }

        if (field === 'weight') {
          updateData.weight_prescribed_kg = newValue
        } else if (field === 'reps') {
          updateData.reps_prescribed = newValue
          const e1rm = prevSet.e1rm_kg
          const rpe = prevSet.rpe_prescribed
          if (e1rm && e1rm > 0 && rpe) {
            const rec = recommendLoad(e1rm, newValue, rpe)
            if (rec) updateData.weight_prescribed_kg = roundToStep(rec)
          }
        } else if (field === 'rpe') {
          updateData.rpe_prescribed = newValue
          const e1rm = prevSet.e1rm_kg
          const reps = prevSet.reps_prescribed
          if (e1rm && e1rm > 0 && reps) {
            const rec = recommendLoad(e1rm, reps, newValue)
            if (rec) updateData.weight_prescribed_kg = roundToStep(rec)
          }
        }

        if (copy_modifiers) {
          if (prevSet.tempo) updateData.tempo = prevSet.tempo
          if (prevSet.rom_prescribed) updateData.rom_prescribed = prevSet.rom_prescribed
          if (prevSet.exercise_format) updateData.exercise_format = prevSet.exercise_format
        }

        updates.push({ id: currSet.id, ...updateData })
      }
    }
  }

  for (const { id, ...data } of updates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from('sets').update(data as any).eq('id', id)
    if (error) return ERRORS.SERVER()
  }

  return ok({ success: true, applied_count: updates.length })
}
