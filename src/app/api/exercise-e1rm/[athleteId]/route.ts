import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ athleteId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { athleteId } = await params
  const exerciseName = request.nextUrl.searchParams.get('exercise')
  if (!exerciseName) return ERRORS.INVALID('exercise parameter requis')

  // Vérif accès : athlète lui-même ou coach avec lien accepté
  if (user.id !== athleteId) {
    const { data: rel } = await supabase
      .from('coach_athlete')
      .select('status')
      .eq('coach_id', user.id)
      .eq('athlete_id', athleteId)
      .eq('status', 'accepted')
      .single()
    if (!rel) return ERRORS.FORBIDDEN()
  }

  const { data, error } = await supabase
    .from('exercise_e1rm')
    .select('e1rm_kg, last_updated_date')
    .eq('athlete_id', athleteId)
    .eq('exercise_name', exerciseName)
    .single()

  if (error) return ok(null)
  return ok(data)
}
