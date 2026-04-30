import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const upsertSchema = z.object({
  // athlete_id requis si POST par un coach
  athlete_id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  general_fatigue: z.number().int().min(1).max(5).nullable().optional(),
  squat_fatigue: z.number().int().min(1).max(5).nullable().optional(),
  bench_fatigue: z.number().int().min(1).max(5).nullable().optional(),
  deadlift_fatigue: z.number().int().min(1).max(5).nullable().optional(),
  motivation: z.number().int().min(1).max(5).nullable().optional(),
  recovery: z.number().int().min(1).max(5).nullable().optional(),
  sleep_duration_min: z.number().int().min(0).max(1440).nullable().optional(),
  sleep_quality: z.number().int().min(1).max(10).nullable().optional(),
  bodyweight_kg: z.number().min(20).max(300).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

// GET /api/traceurs?from=...&to=...&athlete_id=...
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile) return ERRORS.UNAUTHORIZED()

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const athleteId = searchParams.get('athlete_id')

  let targetId = user.id
  if (profile.role === 'coach' && athleteId) {
    // Vérifier que l'athlète appartient au coach (lien accepté)
    const { data: rel } = await supabase
      .from('coach_athlete')
      .select('athlete_id')
      .eq('coach_id', user.id)
      .eq('athlete_id', athleteId)
      .eq('status', 'accepted')
      .single()
    if (!rel) return ERRORS.FORBIDDEN()
    targetId = athleteId
  }

  let query = supabase
    .from('daily_trackers')
    .select('*')
    .eq('athlete_id', targetId)
    .order('date', { ascending: false })

  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)

  const { data, error } = await query.limit(90)
  if (error) return ERRORS.SERVER()
  return ok(data)
}

// POST /api/traceurs  (upsert par date)
// - athlète : pour son propre compte
// - coach : peut écrire pour ses athlètes en passant `athlete_id`
//           (nécessite migration 005_coach_writes_trackers.sql appliquée)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile) return ERRORS.UNAUTHORIZED()

  const body = await request.json()
  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  let athleteId = user.id
  if (profile.role === 'coach') {
    if (!parsed.data.athlete_id) {
      return ERRORS.INVALID('athlete_id requis pour un coach')
    }
    // vérifier la relation coach ↔ athlète (lien accepté)
    const { data: rel } = await supabase
      .from('coach_athlete')
      .select('athlete_id')
      .eq('coach_id', user.id)
      .eq('athlete_id', parsed.data.athlete_id)
      .eq('status', 'accepted')
      .single()
    if (!rel) return ERRORS.FORBIDDEN()
    athleteId = parsed.data.athlete_id
  }

  // Strip athlete_id du payload pour éviter d'écraser
  const { athlete_id: _aid, ...payload } = parsed.data
  void _aid

  const { data, error } = await supabase
    .from('daily_trackers')
    .upsert({ ...payload, athlete_id: athleteId }, { onConflict: 'athlete_id,date' })
    .select()
    .single()

  if (error) {
    console.error('traceurs upsert error', error)
    return ERRORS.SERVER()
  }
  return ok(data, 201)
}
