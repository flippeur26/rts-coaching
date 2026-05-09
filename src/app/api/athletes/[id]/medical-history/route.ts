import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const patchSchema = z.object({
  general_history: z.string().max(5000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
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

// GET /api/athletes/[id]/medical-history
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const access = await checkAccess(supabase, id)
  if (access.error) return access.error

  const { data, error } = await supabase
    .from('athlete_medical_history')
    .select('*')
    .eq('athlete_id', id)
    .maybeSingle()
  if (error) return ERRORS.SERVER()

  if (!data) {
    // Lazy create
    const { data: created, error: insErr } = await supabase
      .from('athlete_medical_history')
      .insert({ athlete_id: id })
      .select()
      .single()
    if (insErr) return ERRORS.SERVER()
    return ok(created)
  }
  return ok(data)
}

// PATCH /api/athletes/[id]/medical-history
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const access = await checkAccess(supabase, id)
  if (access.error) return access.error

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  const { data, error } = await supabase
    .from('athlete_medical_history')
    .upsert({ athlete_id: id, ...parsed.data }, { onConflict: 'athlete_id' })
    .select()
    .single()
  if (error) return ERRORS.SERVER()
  return ok(data)
}
