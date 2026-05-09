import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const setSchema = z.object({
  exercise_name: z.string().min(1).max(100),
  exercise_format: z.string().max(100).nullable().optional(),
  set_number: z.number().int().min(1),
  weight_prescribed_kg: z.number().min(0).max(1000).nullable().optional(),
  reps_prescribed: z.number().int().min(1).max(50).nullable().optional(),
  rpe_prescribed: z.number().min(5).max(10).multipleOf(0.5).nullable().optional(),
  tempo: z.string().max(20).nullable().optional(),
  rom_prescribed: z.string().max(60).nullable().optional(),
})

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  notes_coach: z.string().max(2000).nullable().optional(),
  // option 1 : sets fournis directement
  sets: z.array(setSchema).optional(),
  // option 2 : copier depuis une session existante
  source_session_id: z.string().uuid().optional(),
})

// GET /api/templates/sessions  → liste des templates du coach (avec sets)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { data, error } = await supabase
    .from('session_templates')
    .select('*, session_template_sets(*)')
    .eq('coach_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return ERRORS.SERVER()
  return ok(data)
}

// POST /api/templates/sessions
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

  let setsToInsert = parsed.data.sets ?? []

  // Mode "copier depuis session existante"
  if (parsed.data.source_session_id) {
    const { data: src } = await supabase
      .from('sessions')
      .select('coach_id')
      .eq('id', parsed.data.source_session_id)
      .single()
    if (!src) return ERRORS.NOT_FOUND('Séance source')
    if (src.coach_id !== user.id) return ERRORS.FORBIDDEN()

    const { data: srcSets } = await supabase
      .from('sets')
      .select('exercise_name, exercise_format, set_number, weight_prescribed_kg, reps_prescribed, rpe_prescribed, tempo, rom_prescribed')
      .eq('session_id', parsed.data.source_session_id)
      .order('set_number', { ascending: true })

    setsToInsert = (srcSets ?? []).map(s => ({
      exercise_name: s.exercise_name,
      exercise_format: s.exercise_format,
      set_number: s.set_number,
      weight_prescribed_kg: s.weight_prescribed_kg,
      reps_prescribed: s.reps_prescribed,
      rpe_prescribed: s.rpe_prescribed,
      tempo: s.tempo,
      rom_prescribed: s.rom_prescribed,
    }))
  }

  const { data: tpl, error } = await supabase
    .from('session_templates')
    .insert({
      coach_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      notes_coach: parsed.data.notes_coach ?? null,
    })
    .select()
    .single()

  if (error || !tpl) return ERRORS.SERVER()

  if (setsToInsert.length > 0) {
    const { error: setsErr } = await supabase
      .from('session_template_sets')
      .insert(setsToInsert.map(s => ({ ...s, template_id: tpl.id })))
    if (setsErr) {
      // rollback manuel
      await supabase.from('session_templates').delete().eq('id', tpl.id)
      return ERRORS.SERVER()
    }
  }

  const { data: full } = await supabase
    .from('session_templates')
    .select('*, session_template_sets(*)')
    .eq('id', tpl.id)
    .single()

  return ok(full, 201)
}
