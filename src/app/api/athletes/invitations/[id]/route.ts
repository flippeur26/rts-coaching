import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const respondSchema = z.object({ action: z.enum(['accept', 'reject']) })

// PATCH /api/athletes/invitations/[id]
//   id = UUID du coach (l'athlète est l'utilisateur courant)
//   body = { action: 'accept' | 'reject' }
// Réservé aux athlètes.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'athlete') return ERRORS.FORBIDDEN()

  const { id: coachId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(coachId)) return ERRORS.INVALID('coach_id invalide')

  const body = await request.json()
  const parsed = respondSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID('action requis : accept | reject')

  const newStatus = parsed.data.action === 'accept' ? 'accepted' : 'rejected'

  const { data, error } = await supabase
    .from('coach_athlete')
    .update({ status: newStatus })
    .eq('coach_id', coachId)
    .eq('athlete_id', user.id)
    .select()
    .single()

  if (error || !data) return ERRORS.NOT_FOUND('Invitation')
  return ok(data)
}

// DELETE /api/athletes/invitations/[id]
//   id = UUID de l'autre partie :
//        - athlète appelle → id = coach UUID (se délier)
//        - coach   appelle → id = athlète UUID (annuler invitation / délier)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile) return ERRORS.UNAUTHORIZED()

  const { id: otherId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(otherId)) return ERRORS.INVALID('id invalide')

  const coachId = profile.role === 'coach' ? user.id : otherId
  const athleteId = profile.role === 'coach' ? otherId : user.id

  const { error } = await supabase
    .from('coach_athlete')
    .delete()
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)

  if (error) return ERRORS.SERVER()
  return ok({ deleted: true })
}
