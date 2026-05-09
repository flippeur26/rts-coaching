import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'

/**
 * GET /api/blocks/[id]/full
 *
 * Renvoie le bloc + l'ensemble de ses sessions (avec leurs sets), regroupé prêt à
 * être consommé par BlockEditorClient :
 *
 *   { block, sessions: Session[], sets: Record<sessionId, Set[]> }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id } = await params

  const { data: block, error: blockErr } = await supabase
    .from('blocks')
    .select('*')
    .eq('id', id)
    .single()
  if (blockErr || !block) return ERRORS.NOT_FOUND('Bloc')
  if (block.coach_id !== user.id && block.athlete_id !== user.id) {
    return ERRORS.FORBIDDEN()
  }

  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('*, sets(*)')
    .eq('block_id', id)
    .order('week_in_block', { ascending: true })
    .order('session_number', { ascending: true })
    .order('scheduled_date', { ascending: true })
    .order('set_number', { referencedTable: 'sets', ascending: true })

  if (sErr) return ERRORS.SERVER()

  const { data: progression_configs } = await supabase
    .from('block_progression_config')
    .select('*')
    .eq('block_id', id)

  return ok({
    block,
    sessions: sessions ?? [],
    progression_configs: progression_configs ?? [],
  })
}
