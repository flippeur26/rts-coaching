import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const schema = z.object({
  athlete_id: z.string().uuid(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  block_id: z.string().uuid().nullable().optional(),
  week_in_block: z.number().int().min(1).nullable().optional(),
  session_number: z.number().int().min(1).nullable().optional(),
})

// POST /api/templates/sessions/[id]/instantiate
// Crée une nouvelle session + sets à partir du template, sur (athlete, date)
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

  const { id: templateId } = await params

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  // Vérifier propriété du template
  const { data: tpl } = await supabase
    .from('session_templates')
    .select('*, session_template_sets(*)')
    .eq('id', templateId)
    .single()
  if (!tpl) return ERRORS.NOT_FOUND('Template')
  if (tpl.coach_id !== user.id) return ERRORS.FORBIDDEN()

  // Vérifier lien coach-athlète accepté
  const { data: rel } = await supabase
    .from('coach_athlete')
    .select('athlete_id')
    .eq('coach_id', user.id)
    .eq('athlete_id', parsed.data.athlete_id)
    .eq('status', 'accepted')
    .single()
  if (!rel) return ERRORS.FORBIDDEN()

  // Créer la session
  const { data: newSession, error: sErr } = await supabase
    .from('sessions')
    .insert({
      athlete_id: parsed.data.athlete_id,
      coach_id: user.id,
      block_id: parsed.data.block_id ?? null,
      scheduled_date: parsed.data.scheduled_date,
      week_in_block: parsed.data.week_in_block ?? null,
      session_number: parsed.data.session_number ?? null,
      notes_coach: tpl.notes_coach ?? tpl.name,
    })
    .select()
    .single()

  if (sErr || !newSession) return ERRORS.SERVER()

  // Insérer les sets (sans actual)
  type TplSet = {
    exercise_name: string
    exercise_format: string | null
    set_number: number
    weight_prescribed_kg: number | null
    reps_prescribed: number | null
    rpe_prescribed: number | null
    tempo: string | null
    rom_prescribed: string | null
  }
  const tplSets = ((tpl.session_template_sets ?? []) as unknown) as TplSet[]
  if (tplSets.length > 0) {
    const sets = tplSets
      .sort((a, b) => a.set_number - b.set_number)
      .map(s => ({
        session_id: newSession.id,
        exercise_name: s.exercise_name,
        exercise_format: s.exercise_format,
        set_number: s.set_number,
        weight_prescribed_kg: s.weight_prescribed_kg,
        reps_prescribed: s.reps_prescribed,
        rpe_prescribed: s.rpe_prescribed,
        tempo: s.tempo,
        rom_prescribed: s.rom_prescribed,
      }))
    const { error: setsErr } = await supabase.from('sets').insert(sets)
    if (setsErr) {
      await supabase.from('sessions').delete().eq('id', newSession.id)
      return ERRORS.SERVER()
    }
  }

  return ok(newSession, 201)
}
