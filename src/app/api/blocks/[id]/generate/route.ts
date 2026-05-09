import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'
import { recommendLoad, roundToStep } from '@/lib/rts-calc'
import { applyS1ToWeeks } from '@/lib/progression-sync'

/**
 * POST /api/blocks/[id]/generate
 *
 * Synchronise S2..SN depuis S1 (template). Délègue à `applyS1ToWeeks` qui
 * applique les deltas persistés dans `block_progression_config`.
 *
 * Body :
 *   {
 *     template_week?: number          // défaut 1
 *     target_weeks?: number[]         // défaut: [2..total_weeks]
 *     use_e1rm?: boolean              // calcule weight via E1RM si pas de delta weight
 *     remove_orphans?: boolean        // défaut true — supprime sessions/sets orphelins
 *     recalc_weights_only?: boolean   // recalcule UNIQUEMENT le poids depuis E1RM (S2+)
 *   }
 */
const schema = z.object({
  template_week: z.number().int().min(1).max(20).default(1),
  target_weeks: z.array(z.number().int().min(1).max(20)).optional(),
  use_e1rm: z.boolean().optional().default(false),
  remove_orphans: z.boolean().optional().default(true),
  recalc_weights_only: z.boolean().optional().default(false),
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

  const { id } = await params
  const { data: block } = await supabase
    .from('blocks')
    .select('id, coach_id, athlete_id')
    .eq('id', id)
    .single()
  if (!block) return ERRORS.NOT_FOUND('Bloc')
  if (block.coach_id !== user.id) return ERRORS.FORBIDDEN()

  const body = await request.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  const { template_week, target_weeks, use_e1rm, remove_orphans, recalc_weights_only } = parsed.data

  // Mode recalcul poids uniquement (E1RM fluctuation)
  if (recalc_weights_only) {
    const { data: e1rmRows } = await supabase
      .from('exercise_e1rm')
      .select('exercise_name, e1rm_kg')
      .eq('athlete_id', block.athlete_id)
    const e1rmMap = new Map<string, number>(
      (e1rmRows ?? []).map((r) => [r.exercise_name, r.e1rm_kg]),
    )

    const { data: allSessions } = await supabase
      .from('sessions')
      .select('id, week_in_block, sets(id, exercise_name, reps_prescribed, rpe_prescribed)')
      .eq('block_id', id)
      .neq('week_in_block', template_week)

    let updated = 0
    type Row = {
      id: string
      sets?: Array<{
        id: string
        exercise_name: string | null
        reps_prescribed: number | null
        rpe_prescribed: number | null
      }>
    }
    for (const session of (allSessions ?? []) as unknown as Row[]) {
      for (const s of session.sets ?? []) {
        if (!s.exercise_name || !s.reps_prescribed || !s.rpe_prescribed) continue
        const e1rm = e1rmMap.get(s.exercise_name)
        if (!e1rm || e1rm <= 0) continue
        const rec = recommendLoad(e1rm, s.reps_prescribed, s.rpe_prescribed)
        if (!rec) continue
        await supabase
          .from('sets')
          .update({ weight_prescribed_kg: roundToStep(rec) })
          .eq('id', s.id)
        updated++
      }
    }
    return ok({ recalculated: updated })
  }

  // Sync S1 → S2..SN via helper (lit configs persistées + applique deltas)
  try {
    const result = await applyS1ToWeeks(supabase, id, {
      template_week,
      target_weeks,
      use_e1rm,
      remove_orphans,
    })
    return ok(result)
  } catch {
    return ERRORS.SERVER()
  }
}
