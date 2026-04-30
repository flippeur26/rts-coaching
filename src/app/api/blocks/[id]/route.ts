import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['Accumulation', 'Intensification', 'Réalisation', 'Deload']).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  total_weeks: z.number().int().min(1).max(20).nullable().optional(),
  intensity_zone: z.string().max(50).nullable().optional(),
  weeks_to_competition: z.number().int().min(0).max(52).nullable().optional(),
  is_taper: z.boolean().optional(),
  taper_volume_reduction_pct: z.number().min(0).max(100).nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id } = await params
  const { data: block } = await supabase
    .from('blocks').select('coach_id').eq('id', id).single()
  if (!block) return ERRORS.NOT_FOUND('Bloc')
  if (block.coach_id !== user.id) return ERRORS.FORBIDDEN()

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  const { data, error } = await supabase
    .from('blocks').update(parsed.data).eq('id', id).select().single()
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
  const { data: block } = await supabase
    .from('blocks').select('coach_id').eq('id', id).single()
  if (!block) return ERRORS.NOT_FOUND('Bloc')
  if (block.coach_id !== user.id) return ERRORS.FORBIDDEN()

  const { error } = await supabase.from('blocks').delete().eq('id', id)
  if (error) return ERRORS.SERVER()
  return ok({ deleted: true })
}
