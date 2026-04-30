import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { computePerformanceAlerts } from '@/lib/dashboard'
import type { Set } from '@/types/database'

// GET /api/athletes/[id]/programmes - programmes actifs + sessions récentes + alertes
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const athleteId = params.id

  // Vérifier que l'utilisateur a accès à cet athlète
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'coach') {
    const { data: rel } = await supabase
      .from('coach_athlete')
      .select('athlete_id')
      .eq('coach_id', user.id)
      .eq('athlete_id', athleteId)
      .eq('status', 'accepted')
      .single()

    if (!rel) return ERRORS.FORBIDDEN()
  } else {
    // Athlète voit ses propres données
    if (user.id !== athleteId) return ERRORS.FORBIDDEN()
  }

  // Charger les blocs actifs (date de début < aujourd'hui ET date de fin > aujourd'hui OU null)
  const today = new Date().toISOString().split('T')[0]

  const { data: activeBlocks, error: blocksError } = await supabase
    .from('blocks')
    .select('id, name, type, start_date, end_date')
    .eq('athlete_id', athleteId)
    .lte('start_date', today)
    .or(`end_date.gt.${today},end_date.is.null`)

  if (blocksError) {
    console.error('Blocks fetch error:', blocksError)
    return ERRORS.SERVER()
  }

  if (!activeBlocks || activeBlocks.length === 0) {
    return ok({ programs: [] })
  }

  // Charger les sessions des blocs actifs
  const blockIds = activeBlocks.map((b) => b.id)
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, block_id, scheduled_date, status, notes_coach')
    .in('block_id', blockIds)
    .order('scheduled_date', { ascending: false })

  if (sessionsError) {
    console.error('Sessions fetch error:', sessionsError)
    return ERRORS.SERVER()
  }

  // Charger les sets des sessions
  const sessionIds = sessions?.map((s) => s.id) || []
  const { data: allSets, error: setsError } = await supabase
    .from('sets')
    .select('*')
    .in('session_id', sessionIds)

  if (setsError) {
    console.error('Sets fetch error:', setsError)
    return ERRORS.SERVER()
  }

  // Construire la réponse
  const programs = activeBlocks.map((block) => {
    const blockSessions = sessions?.filter((s) => s.block_id === block.id) || []
    const blockSets = (allSets || []).filter((set) =>
      blockSessions.some((s) => s.id === set.session_id)
    ) as Set[]

    // Calculer les alertes de performance pour ce bloc
    const performanceAlerts = computePerformanceAlerts(blockSets)

    return {
      id: block.id,
      name: block.name,
      type: block.type,
      start_date: block.start_date,
      end_date: block.end_date,
      sessions_count: blockSessions.length,
      completed_sessions: blockSessions.filter((s) => s.status === 'completed').length,
      sets_total: blockSets.length,
      performance_alerts: performanceAlerts,
    }
  })

  return ok({ programs })
}
