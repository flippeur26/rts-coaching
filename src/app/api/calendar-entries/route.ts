import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'

/**
 * GET /api/calendar-entries?athlete_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Agrège, pour la grille calendrier :
 *   - sessions (avec leurs sets) sur la fenêtre
 *   - daily_trackers
 *   - competitions
 *
 * Sécurité :
 *   - coach : doit fournir athlete_id et avoir la relation coach_athlete
 *   - athlète : ignore athlete_id, utilise son propre id
 */
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
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const athleteIdParam = searchParams.get('athlete_id')

  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return ERRORS.INVALID('from/to requis au format YYYY-MM-DD')
  }

  let targetAthleteId = user.id
  if (profile.role === 'coach') {
    if (!athleteIdParam) return ERRORS.INVALID('athlete_id requis pour un coach')
    const { data: rel } = await supabase
      .from('coach_athlete')
      .select('athlete_id')
      .eq('coach_id', user.id)
      .eq('athlete_id', athleteIdParam)
      .eq('status', 'accepted')
      .single()
    if (!rel) return ERRORS.FORBIDDEN()
    targetAthleteId = athleteIdParam
  }

  const [sessionsRes, trackersRes, compsRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('*, sets(*)')
      .eq('athlete_id', targetAthleteId)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)
      .order('scheduled_date', { ascending: true })
      .order('set_number', { referencedTable: 'sets', ascending: true }),
    supabase
      .from('daily_trackers')
      .select('*')
      .eq('athlete_id', targetAthleteId)
      .gte('date', from)
      .lte('date', to),
    supabase
      .from('competitions')
      .select('*')
      .eq('athlete_id', targetAthleteId)
      .gte('competition_date', from)
      .lte('competition_date', to),
  ])

  if (sessionsRes.error || trackersRes.error || compsRes.error) {
    console.error('calendar-entries error', {
      s: sessionsRes.error,
      t: trackersRes.error,
      c: compsRes.error,
    })
    return ERRORS.SERVER()
  }

  return ok({
    sessions: sessionsRes.data ?? [],
    trackers: trackersRes.data ?? [],
    competitions: compsRes.data ?? [],
  })
}
