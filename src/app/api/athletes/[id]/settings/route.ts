import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

const patchSchema = z.object({
  unit_system: z.enum(['metric', 'imperial']).optional(),
  bar_weight_kg: z.number().min(1).max(50).optional(),
  collar_weight_kg: z.number().min(0).max(10).optional(),
  available_plates_kg: z.array(z.number().min(0.1).max(50)).max(20).optional(),
})

async function checkAccess(supabase: Awaited<ReturnType<typeof createClient>>, athleteId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: ERRORS.UNAUTHORIZED() }

  // Athlète qui consulte/modifie son propre profil
  if (user.id === athleteId) return { user }

  // Coach lié (status accepted) à cet athlète
  const { data: rel } = await supabase
    .from('coach_athlete')
    .select('athlete_id')
    .eq('coach_id', user.id)
    .eq('athlete_id', athleteId)
    .eq('status', 'accepted')
    .single()
  if (!rel) return { error: ERRORS.FORBIDDEN() }
  return { user }
}

// GET /api/athletes/[id]/settings
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const access = await checkAccess(supabase, id)
  if (access.error) return access.error

  const { data, error } = await supabase
    .from('athlete_settings')
    .select('*')
    .eq('athlete_id', id)
    .maybeSingle()

  if (error) return ERRORS.SERVER()

  // Si pas de settings (cas où le trigger n'a pas tourné, ex : athlète d'avant migration 012)
  // → on les crée à la volée avec les défauts.
  if (!data) {
    const { data: created, error: insertErr } = await supabase
      .from('athlete_settings')
      .insert({ athlete_id: id })
      .select()
      .single()
    if (insertErr) return ERRORS.SERVER()
    return ok(created)
  }

  return ok(data)
}

// PATCH /api/athletes/[id]/settings
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const access = await checkAccess(supabase, id)
  if (access.error) return access.error

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  // Trier les disques décroissants pour cohérence d'affichage
  const updates = { ...parsed.data }
  if (updates.available_plates_kg) {
    updates.available_plates_kg = [...updates.available_plates_kg].sort((a, b) => b - a)
  }

  // Upsert (au cas où la ligne n'existe pas encore)
  const { data, error } = await supabase
    .from('athlete_settings')
    .upsert({ athlete_id: id, ...updates }, { onConflict: 'athlete_id' })
    .select()
    .single()

  if (error) return ERRORS.SERVER()
  return ok(data)
}
