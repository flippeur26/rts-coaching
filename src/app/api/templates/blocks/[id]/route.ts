import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id } = await params
  const { data: tpl } = await supabase
    .from('block_templates').select('coach_id').eq('id', id).single()
  if (!tpl) return ERRORS.NOT_FOUND('Template')
  if (tpl.coach_id !== user.id) return ERRORS.FORBIDDEN()

  const { error } = await supabase.from('block_templates').delete().eq('id', id)
  if (error) return ERRORS.SERVER()
  return ok({ deleted: true })
}
