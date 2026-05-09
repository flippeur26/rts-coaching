import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  type: z.enum(['Accumulation', 'Intensification', 'Réalisation', 'Deload']),
  total_weeks: z.number().int().min(1).max(20).nullable().optional(),
  intensity_zone: z.string().max(50).nullable().optional(),
  weeks_to_competition: z.number().int().min(0).max(52).nullable().optional(),
  is_taper: z.boolean().optional(),
  taper_volume_reduction_pct: z.number().min(0).max(100).nullable().optional(),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { data, error } = await supabase
    .from('block_templates')
    .select('*')
    .eq('coach_id', user.id)
    .order('created_at', { ascending: false })

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

  const { data, error } = await supabase
    .from('block_templates')
    .insert({ ...parsed.data, coach_id: user.id })
    .select()
    .single()

  if (error) return ERRORS.SERVER()
  return ok(data, 201)
}
