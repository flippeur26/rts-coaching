import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const createSchema = z.object({
  athlete_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.enum(['Accumulation', 'Intensification', 'Réalisation', 'Deload']),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  total_weeks: z.number().int().min(1).max(20).nullable().optional(),
  intensity_zone: z.string().max(50).nullable().optional(),
  weeks_to_competition: z.number().int().min(0).max(52).nullable().optional(),
  is_taper: z.boolean().optional(),
  taper_volume_reduction_pct: z.number().min(0).max(100).nullable().optional(),
})

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { searchParams } = new URL(request.url)
  const athleteId = searchParams.get('athlete_id')
  if (!athleteId) return ERRORS.INVALID('athlete_id requis')

  const { data: rel } = await supabase
    .from('coach_athlete')
    .select('athlete_id')
    .eq('coach_id', user.id)
    .eq('athlete_id', athleteId)
    .eq('status', 'accepted')
    .single()
  if (!rel) return ERRORS.FORBIDDEN()

  const { data, error } = await supabase
    .from('blocks')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('start_date', { ascending: false })

  if (error) return ERRORS.SERVER()
  return ok(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'coach') return ERRORS.FORBIDDEN()

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  const { data: rel } = await supabase
    .from('coach_athlete')
    .select('athlete_id')
    .eq('coach_id', user.id)
    .eq('athlete_id', parsed.data.athlete_id)
    .eq('status', 'accepted')
    .single()
  if (!rel) return ERRORS.FORBIDDEN()

  const { data, error } = await supabase
    .from('blocks')
    .insert({ ...parsed.data, coach_id: user.id })
    .select()
    .single()

  if (error) return ERRORS.SERVER()
  return ok(data, 201)
}
