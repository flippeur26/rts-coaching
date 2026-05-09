import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const BODY_ZONES = ['Cervicales','Épaule','Coude','Poignet','Lombaires','Hanche','Genou','Cheville','Pied','Tronc','Jambe','Bras'] as const

const createSchema = z.object({
  body_zone: z.enum(BODY_ZONES),
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

// GET /api/athletes/[id]/injuries
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const access = await checkAccess(supabase, id)
  if (access.error) return access.error

  const { data, error } = await supabase
    .from('athlete_injuries')
    .select('*')
    .eq('athlete_id', id)
    .order('status', { ascending: true })
    .order('started_on', { ascending: false })
  if (error) return ERRORS.SERVER()
  return ok(data)
}

// POST /api/athletes/[id]/injuries
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const access = await checkAccess(supabase, id)
  if (access.error) return access.error

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  // Si status=resolved et pas de resolved_on → today
  const payload = { ...parsed.data, athlete_id: id }
  if (payload.status === 'resolved' && !payload.resolved_on) {
    payload.resolved_on = new Date().toISOString().slice(0, 10)
  }

  const { data, error } = await supabase
    .from('athlete_injuries')
    .insert(payload)
    .select()
    .single()
  if (error) return ERRORS.SERVER()
  return ok(data, 201)
}
