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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id: blockId } = await params
  const body = await request.json()
  const parsed = progressionSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  const {
    source_week,
    target_week,
    exercises,
    field,
    type,
    value,
    copy_modifiers = true,
    detect_overperformance = true,
    apply_to_all_weeks = false,
  } = parsed.data

  // Vérifier accès au bloc
  const { data: block } = await supabase
    .from('blocks')
    .select('id, coach_id, athlete_id')
    .eq('id', blockId)
    .single()
  if (!block) return ERRORS.NOT_FOUND('Bloc')
  if (block.coach_id !== user.id && block.athlete_id !== user.id) {
    return ERRORS.FORBIDDEN()
  }
  if (block.coach_id !== user.id) {
    // Seul le coach peut faire des progressions
    return ERRORS.FORBIDDEN()
  }

  // Charger TOUTES les séances du bloc
  const { data: allSessions, error: allError } = await supabase
    .from('sessions')
    .select('id, week_in_block, sets(*)')
    .eq('block_id', blockId)
    .order('week_in_block', { ascending: true })

  if (allError) return ERRORS.SERVER()

  const sessionsByWeek = new Map<number, any[]>()
  for (const session of allSessions || []) {
    const week = session.week_in_block || 0
    if (!sessionsByWeek.has(week)) {
      sessionsByWeek.set(week, [])
    }
    sessionsByWeek.get(week)!.push(session)
  }

  // Déterminer jusqu'à quelle semaine appliquer
  const maxWeek = apply_to_all_weeks
    ? Math.max(...Array.from(sessionsByWeek.keys()))
    : target_week

  const updates: any[] = []

  // Pour chaque semaine de target_week à maxWeek
  for (let currentWeek = target_week; currentWeek <= maxWeek; currentWeek++) {
    const prevWeek = currentWeek - 1
    const prevSessions = sessionsByWeek.get(prevWeek) || []
    const currSessions = sessionsByWeek.get(currentWeek) || []

    if (prevSessions.length === 0 || currSessions.length === 0) continue

    // Appliquer les progressions de prevWeek → currentWeek
    for (let sessIdx = 0; sessIdx < prevSessions.length; sessIdx++) {
      const prevSession = prevSessions[sessIdx]
      const currSession = currSessions[sessIdx]

      if (!currSession) continue

      const prevSets = ((prevSession as any).sets || []).filter(
        (s: any) => exercises.includes(s.exercise_name)
      )
      const currSets = ((currSession as any).sets || []).filter(
        (s: any) => exercises.includes(s.exercise_name)
      )

      for (let setIdx = 0; setIdx < prevSets.length; setIdx++) {
        const prevSet = prevSets[setIdx]
        const currSet = currSets[setIdx]

        if (!currSet) continue

        let newValue: any = null

        // Calculer la nouvelle valeur selon le field (basée sur prevWeek)
        if (field === 'weight') {
          const currentWeight = prevSet.weight_prescribed_kg ?? 0
          if (type === 'fixed') {
            newValue = currentWeight + value
          } else {
            newValue = currentWeight * (1 + value / 100)
          }

          // Détection intelligente
          if (
            detect_overperformance &&
            prevSet.rpe_realization_pct != null &&
            prevSet.rpe_realization_pct > 110
          ) {
            newValue *= 0.8 // Réduire de 20%
          }
        } else if (field === 'reps') {
          const currentReps = prevSet.reps_prescribed ?? 0
          if (type === 'fixed') {
            newValue = Math.max(1, currentReps + value)
          } else {
            newValue = Math.max(1, Math.round(currentReps * (1 + value / 100)))
          }
        } else if (field === 'rpe') {
          const currentRpe = prevSet.rpe_prescribed ?? 0
          if (type === 'fixed') {
            newValue = Math.min(10, Math.max(5, currentRpe + value))
          } else {
            newValue = Math.min(
              10,
              Math.max(5, currentRpe * (1 + value / 100))
            )
          }
        }

        // Construire l'update — toujours copier l'intégralité de la prescription
        // depuis prevWeek, puis appliquer la progression sur le field choisi
        const updateData: any = {
          weight_prescribed_kg: prevSet.weight_prescribed_kg,
          reps_prescribed: prevSet.reps_prescribed,
          rpe_prescribed: prevSet.rpe_prescribed,
        }

        if (field === 'weight') {
          updateData.weight_prescribed_kg = newValue
        } else if (field === 'reps') {
          updateData.reps_prescribed = newValue

          // Recalculer weight via table RPE RTS officielle
          const e1rm = prevSet.e1rm_kg
          const rpe = prevSet.rpe_prescribed
          if (e1rm && e1rm > 0 && rpe) {
            const recommended = recommendLoad(e1rm, newValue, rpe)
            if (recommended) updateData.weight_prescribed_kg = roundToStep(recommended)
          }
        } else if (field === 'rpe') {
          updateData.rpe_prescribed = newValue

          // Recalculer weight via table RPE RTS officielle
          const e1rm = prevSet.e1rm_kg
          const reps = prevSet.reps_prescribed
          if (e1rm && e1rm > 0 && reps) {
            const recommended = recommendLoad(e1rm, reps, newValue)
            if (recommended) updateData.weight_prescribed_kg = roundToStep(recommended)
          }
        }

        // Copier modificateurs
        if (copy_modifiers) {
          if (prevSet.tempo) updateData.tempo = prevSet.tempo
          if (prevSet.rom_prescribed)
            updateData.rom_prescribed = prevSet.rom_prescribed
          if (prevSet.exercise_format)
            updateData.exercise_format = prevSet.exercise_format
        }

        if (Object.keys(updateData).length > 0) {
          updates.push({
            id: currSet.id,
            ...updateData,
          })
        }
      }
    }
  }

  // Appliquer les updates
  if (updates.length > 0) {
    for (const update of updates) {
      const { id, ...data } = update
      const { error: updateError } = await supabase
        .from('sets')
        .update(data)
        .eq('id', id)

      if (updateError) {
        console.error('Update set error:', updateError)
        return ERRORS.SERVER()
      }
    }
  }

  return ok({
    success: true,
    applied_count: updates.length,
    weeks_updated: apply_to_all_weeks ? maxWeek - target_week + 1 : 1,
    message: apply_to_all_weeks
      ? `${updates.length} sets progressés vers semaines ${target_week}-${maxWeek}`
      : `${updates.length} sets progressés vers semaine ${target_week}`,
  })
}
