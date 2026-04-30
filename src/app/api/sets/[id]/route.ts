import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const updateSetCoachSchema = z.object({
  exercise_name: z.string().min(1).max(100).optional(),
  exercise_format: z.string().max(100).nullable().optional(),
  set_number: z.number().int().min(1).optional(),
  weight_prescribed_kg: z.number().min(0).max(1000).nullable().optional(),
  reps_prescribed: z.number().int().min(1).max(50).nullable().optional(),
  rpe_prescribed: z.number().min(5).max(10).multipleOf(0.5).nullable().optional(),
  tempo: z.string().max(20).nullable().optional(),
  rom_prescribed: z.string().max(60).nullable().optional(),
  // Le coach peut aussi saisir le réalisé
  weight_actual_kg: z.number().min(0).max(1000).nullable().optional(),
  reps_actual: z.number().int().min(1).max(50).nullable().optional(),
  rpe_actual: z.number().min(5).max(10).multipleOf(0.5).nullable().optional(),
  rom_actual: z.string().max(60).nullable().optional(),
})

const updateSetAthleteSchema = z.object({
  weight_actual_kg: z.number().min(0).max(1000).nullable().optional(),
  reps_actual: z.number().int().min(1).max(50).nullable().optional(),
  rpe_actual: z.number().min(5).max(10).multipleOf(0.5).nullable().optional(),
  rom_actual: z.string().max(60).nullable().optional(),
})

// PATCH /api/sets/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id } = await params

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile) return ERRORS.UNAUTHORIZED()

  const { data: setRow } = await supabase
    .from('sets')
    .select('id, session_id')
    .eq('id', id)
    .single()

  if (!setRow) return ERRORS.NOT_FOUND('Set')

  const { data: session } = await supabase
    .from('sessions')
    .select('coach_id, athlete_id')
    .eq('id', setRow.session_id)
    .single()

  if (!session) return ERRORS.NOT_FOUND('Séance')

  const isCoach = profile.role === 'coach' && session.coach_id === user.id
  const isAthlete = profile.role === 'athlete' && session.athlete_id === user.id
  if (!isCoach && !isAthlete) return ERRORS.FORBIDDEN()

  const body = await request.json()
  const schema = isCoach ? updateSetCoachSchema : updateSetAthleteSchema
  const parsed = schema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  const { data, error } = await supabase
    .from('sets')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return ERRORS.SERVER()
  return ok(data)
}

// DELETE /api/sets/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id } = await params

  const { data: setRow } = await supabase
    .from('sets')
    .select('id, session_id')
    .eq('id', id)
    .single()

  if (!setRow) return ERRORS.NOT_FOUND('Set')

  const { data: session } = await supabase
    .from('sessions')
    .select('coach_id')
    .eq('id', setRow.session_id)
    .single()

  if (session?.coach_id !== user.id) return ERRORS.FORBIDDEN()

  const { error } = await supabase.from('sets').delete().eq('id', id)
  if (error) return ERRORS.SERVER()

  return ok({ deleted: true })
}
