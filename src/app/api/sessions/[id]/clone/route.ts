import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const schema = z.object({
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  athlete_id: z.string().uuid().optional(), // si absent → même athlète que la source
})

// POST /api/sessions/[id]/clone
// Duplique une séance existante (prescription only) sur une nouvelle date.
// Le réalisé n'est jamais copié — la nouvelle séance part en status 'prescribed'.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'coach') return ERRORS.FORBIDDEN()

  const { id } = await params
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  // Récupérer la session source
  const { data: src } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single()
  if (!src) return ERRORS.NOT_FOUND('Séance')
  if (src.coach_id !== user.id) return ERRORS.FORBIDDEN()

  const targetAthleteId = parsed.data.athlete_id ?? src.athlete_id

  // Si athlete cible différent, vérifier le lien
  if (targetAthleteId !== src.athlete_id) {
    const { data: rel } = await supabase
      .from('coach_athlete')
      .select('athlete_id')
      .eq('coach_id', user.id)
      .eq('athlete_id', targetAthleteId)
      .eq('status', 'accepted')
      .single()
    if (!rel) return ERRORS.FORBIDDEN()
  }

  // Créer la session clone
  const { data: newSession, error: sErr } = await supabase
    .from('sessions')
    .insert({
      athlete_id: targetAthleteId,
      coach_id: user.id,
      block_id: src.block_id,
      scheduled_date: parsed.data.scheduled_date,
      week_in_block: src.week_in_block,
      session_number: src.session_number,
      notes_coach: src.notes_coach,
    })
    .select()
    .single()

  if (sErr || !newSession) return ERRORS.SERVER()

  // Copier les sets (prescription uniquement)
  const { data: srcSets } = await supabase
    .from('sets')
    .select('exercise_name, exercise_format, set_number, weight_prescribed_kg, reps_prescribed, rpe_prescribed, tempo, rom_prescribed')
    .eq('session_id', id)
    .order('set_number', { ascending: true })

  if (srcSets && srcSets.length > 0) {
    const newSets = srcSets.map(s => ({
      ...s,
      session_id: newSession.id,
    }))
    const { error: setsErr } = await supabase.from('sets').insert(newSets)
    if (setsErr) {
      await supabase.from('sessions').delete().eq('id', newSession.id)
      return ERRORS.SERVER()
    }
  }

  return ok(newSession, 201)
}
