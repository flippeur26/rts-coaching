import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const updateSchema = z.object({
  competition_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name: z.string().min(1).max(200).optional(),
  squat_attempt_1: z.number().nullable().optional(),
  squat_attempt_2: z.number().nullable().optional(),
  squat_attempt_3: z.number().nullable().optional(),
  bench_attempt_1: z.number().nullable().optional(),
  bench_attempt_2: z.number().nullable().optional(),
  bench_attempt_3: z.number().nullable().optional(),
  deadlift_attempt_1: z.number().nullable().optional(),
  deadlift_attempt_2: z.number().nullable().optional(),
  deadlift_attempt_3: z.number().nullable().optional(),
  projected_total: z.number().nullable().optional(),
  squat_result_1: z.boolean().nullable().optional(),
  squat_result_2: z.boolean().nullable().optional(),
  squat_result_3: z.boolean().nullable().optional(),
  squat_best_kg: z.number().nullable().optional(),
  bench_result_1: z.boolean().nullable().optional(),
  bench_result_2: z.boolean().nullable().optional(),
  bench_result_3: z.boolean().nullable().optional(),
  bench_best_kg: z.number().nullable().optional(),
  deadlift_result_1: z.boolean().nullable().optional(),
  deadlift_result_2: z.boolean().nullable().optional(),
  deadlift_result_3: z.boolean().nullable().optional(),
  deadlift_best_kg: z.number().nullable().optional(),
  total_kg: z.number().nullable().optional(),
  ipf_gl_points: z.number().nullable().optional(),
  post_comp_notes: z.string().max(2000).nullable().optional(),
  weakest_lift: z.string().max(50).nullable().optional(),
  next_block_goals: z.string().max(2000).nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id } = await params
  const { data: comp } = await supabase
    .from('competitions').select('coach_id, athlete_id').eq('id', id).single()
  if (!comp) return ERRORS.NOT_FOUND('Compétition')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  const isCoach = profile?.role === 'coach' && comp.coach_id === user.id
  const isAthlete = profile?.role === 'athlete' && comp.athlete_id === user.id
  if (!isCoach && !isAthlete) return ERRORS.FORBIDDEN()

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  const { data, error } = await supabase
    .from('competitions').update(parsed.data).eq('id', id).select().single()
  if (error) return ERRORS.SERVER()
  return ok(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id } = await params
  const { data: comp } = await supabase
    .from('competitions').select('coach_id').eq('id', id).single()
  if (!comp) return ERRORS.NOT_FOUND('Compétition')
  if (comp.coach_id !== user.id) return ERRORS.FORBIDDEN()

  const { error } = await supabase.from('competitions').delete().eq('id', id)
  if (error) return ERRORS.SERVER()
  return ok({ deleted: true })
}
