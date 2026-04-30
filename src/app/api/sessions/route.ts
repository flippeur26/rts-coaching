import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const createSessionSchema = z.object({
  athlete_id: z.string().uuid(),
  block_id: z.string().uuid().nullable().optional(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  week_in_block: z.number().int().min(1).nullable().optional(),
  session_number: z.number().int().min(1).nullable().optional(),
  notes_coach: z.string().max(2000).nullable().optional(),
})

// GET /api/sessions?athlete_id=...&from=...&to=...
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile) return ERRORS.UNAUTHORIZED()

  const { searchParams } = new URL(request.url)
  const athleteId = searchParams.get('athlete_id')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let query = supabase
    .from('sessions')
    .select('*, sets(*)')
    .order('scheduled_date', { ascending: true })
    .order('set_number', { referencedTable: 'sets', ascending: true })

  if (profile.role === 'coach') {
    query = query.eq('coach_id', user.id)
    if (athleteId) query = query.eq('athlete_id', athleteId)
  } else {
    query = query.eq('athlete_id', user.id)
  }

  if (from) query = query.gte('scheduled_date', from)
  if (to) query = query.lte('scheduled_date', to)

  const { data, error } = await query
  if (error) return ERRORS.SERVER()

  return ok(data)
}

// POST /api/sessions
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'coach') return ERRORS.FORBIDDEN()

  const body = await request.json()
  const parsed = createSessionSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  // Vérifier que l'athlète appartient à ce coach (lien accepté)
  const { data: rel } = await supabase
    .from('coach_athlete')
    .select('athlete_id')
    .eq('coach_id', user.id)
    .eq('athlete_id', parsed.data.athlete_id)
    .eq('status', 'accepted')
    .single()
  if (!rel) return ERRORS.FORBIDDEN()

  const { data, error } = await supabase
    .from('sessions')
    .insert({ ...parsed.data, coach_id: user.id })
    .select()
    .single()

  if (error) return ERRORS.SERVER()
  return ok(data, 201)
}
