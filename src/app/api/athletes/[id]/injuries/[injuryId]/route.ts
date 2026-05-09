import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const BODY_ZONES = ['Cervicales','Épaule','Coude','Poignet','Lombaires','Hanche','Genou','Cheville','Pied','Tronc','Jambe','Bras'] as const

const patchSchema = z.object({
  body_zone: z.enum(BODY_ZONES).optional(),
  description: z.string().max(1000).nullable().optional(),
  severity: z.number().int().min(1).max(5).nullable().optional(),
  status: z.enum(['active','resolved']).optional(),
  started_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  resolved_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

async function checkAccess(supabase: Awaited<ReturnType<typeof createClient>>, athleteId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: ERRORS.UNAUTHORIZED() }
  if (user.id === athleteId) return { user }
  const { data: rel } = await supabase
    .from('coach_athlete')
    .select('athlete_id')
    .eq('coach_id', user.id)
    .eq('athlete_id', athleteId)
    .eq('status', 'accepted')
    .single()
  if (!rel) return { error: ERRORS.FORBIDDEN() }
  return { user }
}

// PATCH /api/athletes/[id]/injuries/[injuryId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; injuryId: string }> }
) {
  const supabase = await createClient()
  const { id, injuryId } = await params
  const access = await checkAccess(supabase, id)
  if (access.error) return access.error

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  // Vérifier que l'injury appartient à l'athlète
  const { data: existing } = await supabase
    .from('athlete_injuries')
    .select('athlete_id')
    .eq('id', injuryId)
    .single()
  if (!existing) return ERRORS.NOT_FOUND('Blessure')
  if (existing.athlete_id !== id) return ERRORS.FORBIDDEN()

  const updates = { ...parsed.data }
  if (updates.status === 'resolved' && !updates.resolved_on) {
    updates.resolved_on = new Date().toISOString().slice(0, 10)
  }
  if (updates.status === 'active') {
    updates.resolved_on = null
  }

  const { data, error } = await supabase
    .from('athlete_injuries')
    .update(updates)
    .eq('id', injuryId)
    .select()
    .single()
  if (error) return ERRORS.SERVER()
  return ok(data)
}

// DELETE /api/athletes/[id]/injuries/[injuryId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; injuryId: string }> }
) {
  const supabase = await createClient()
  const { id, injuryId } = await params
  const access = await checkAccess(supabase, id)
  if (access.error) return access.error

  const { data: existing } = await supabase
    .from('athlete_injuries')
    .select('athlete_id')
    .eq('id', injuryId)
    .single()
  if (!existing) return ERRORS.NOT_FOUND('Blessure')
  if (existing.athlete_id !== id) return ERRORS.FORBIDDEN()

  const { error } = await supabase
    .from('athlete_injuries')
    .delete()
    .eq('id', injuryId)
  if (error) return ERRORS.SERVER()
  return ok({ deleted: true })
}
