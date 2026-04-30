import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const createSetSchema = z.object({
  exercise_name: z.string().min(1).max(100),
  exercise_format: z.string().max(100).nullable().optional(),
  set_number: z.number().int().min(1),
  weight_prescribed_kg: z.number().min(0).max(1000).nullable().optional(),
  reps_prescribed: z.number().int().min(1).max(50).nullable().optional(),
  rpe_prescribed: z.number().min(5).max(10).multipleOf(0.5).nullable().optional(),
  tempo: z.string().max(20).nullable().optional(),
  rom_prescribed: z.string().max(60).nullable().optional(),
  weight_actual_kg: z.number().min(0).max(1000).nullable().optional(),
  reps_actual: z.number().int().min(1).max(50).nullable().optional(),
  rpe_actual: z.number().min(5).max(10).multipleOf(0.5).nullable().optional(),
  rom_actual: z.string().max(60).nullable().optional(),
})

const bulkSetsSchema = z.array(createSetSchema)

// GET /api/sessions/[id]/sets
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id } = await params

  const { data: session } = await supabase
    .from('sessions')
    .select('coach_id, athlete_id')
    .eq('id', id)
    .single()
  if (!session) return ERRORS.NOT_FOUND('Séance')

  if (session.coach_id !== user.id && session.athlete_id !== user.id) {
    return ERRORS.FORBIDDEN()
  }

  const { data, error } = await supabase
    .from('sets')
    .select('*')
    .eq('session_id', id)
    .order('set_number', { ascending: true })

  if (error) return ERRORS.SERVER()
  return ok(data)
}

// POST /api/sessions/[id]/sets  (création d'un set ou d'un tableau de sets)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id } = await params

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'coach') return ERRORS.FORBIDDEN()

  const { data: session } = await supabase
    .from('sessions')
    .select('coach_id')
    .eq('id', id)
    .single()
  if (!session) return ERRORS.NOT_FOUND('Séance')
  if (session.coach_id !== user.id) return ERRORS.FORBIDDEN()

  const body = await request.json()

  // Accepte soit un objet unique, soit un tableau
  const isBulk = Array.isArray(body)
  const parsed = isBulk
    ? bulkSetsSchema.safeParse(body)
    : createSetSchema.safeParse(body)

  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  const toInsert = isBulk
    ? (parsed.data as z.infer<typeof createSetSchema>[]).map(s => ({ ...s, session_id: id }))
    : [{ ...(parsed.data as z.infer<typeof createSetSchema>), session_id: id }]

  const { data, error } = await supabase
    .from('sets')
    .insert(toInsert)
    .select()

  if (error) return ERRORS.SERVER()
  return ok(isBulk ? data : data[0], 201)
}
