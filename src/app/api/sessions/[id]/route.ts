import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const updateSessionSchema = z.object({
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  week_in_block: z.number().int().min(1).nullable().optional(),
  session_number: z.number().int().min(1).nullable().optional(),
  notes_coach: z.string().max(2000).nullable().optional(),
  notes_athlete: z.string().max(2000).nullable().optional(),
  bodyweight_kg: z.number().min(20).max(300).nullable().optional(),
  duration_min: z.number().int().min(1).max(480).nullable().optional(),
  session_feel: z.number().int().min(1).max(5).nullable().optional(),
  status: z.enum(['prescribed', 'in_progress', 'completed']).optional(),
  block_id: z.string().uuid().nullable().optional(),
})

// PATCH /api/sessions/[id]
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

  // Vérifier accès à la séance
  const { data: session } = await supabase
    .from('sessions')
    .select('id, coach_id, athlete_id, status')
    .eq('id', id)
    .single()
  if (!session) return ERRORS.NOT_FOUND('Séance')

  const isCoach = profile.role === 'coach' && session.coach_id === user.id
  const isAthlete = profile.role === 'athlete' && session.athlete_id === user.id
  if (!isCoach && !isAthlete) return ERRORS.FORBIDDEN()

  const body = await request.json()
  const parsed = updateSessionSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  // L'athlète ne peut modifier que notes_athlete, bodyweight_kg, duration_min, session_feel, status
  if (isAthlete) {
    const allowedFields = ['notes_athlete', 'bodyweight_kg', 'duration_min', 'session_feel', 'status']
    const forbidden = Object.keys(parsed.data).filter(k => !allowedFields.includes(k))
    if (forbidden.length > 0) return ERRORS.FORBIDDEN()
  }

  const updates = {
    ...parsed.data,
    ...(parsed.data.status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
  }

  const { data, error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return ERRORS.SERVER()
  return ok(data)
}

// DELETE /api/sessions/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id } = await params

  const { data: session } = await supabase
    .from('sessions')
    .select('coach_id')
    .eq('id', id)
    .single()
  if (!session) return ERRORS.NOT_FOUND('Séance')
  if (session.coach_id !== user.id) return ERRORS.FORBIDDEN()

  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) return ERRORS.SERVER()

  return ok({ deleted: true })
}
