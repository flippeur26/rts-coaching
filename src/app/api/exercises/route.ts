import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

// GET /api/exercises?category=...&search=...
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const search = searchParams.get('search')

  let query = supabase
    .from('exercises')
    .select('id, name, category, coach_id')
    .order('name', { ascending: true })

  // RLS policies gèrent automatiquement : globaux (coach_id IS NULL) + ceux du coach

  if (category && category !== '') {
    query = query.eq('category', category as 'Squat' | 'Hinge' | 'Horizontal Push' | 'Horizontal Pull' | 'Vertical Push' | 'Vertical Pull' | 'Accessoire' | 'Cardio')
  }

  if (search && search !== '') {
    query = query.ilike('name', `%${search}%`)
  }

  const { data, error } = await query
  if (error) {
    console.error('Exercises fetch error:', error)
    return ERRORS.SERVER()
  }

  // Filtre : exclut les variantes de Squat, Bench, Deadlift
  // (Larsen, Spoto, Box, Déficit, High Bar, Low Bar, Pin Press, Cale, Close Grip, Wide Grip, Sumo, Conventionnel)
  const variantKeywords = /\b(Larsen|Spoto|Pause|Box|Déficit|High Bar|Low Bar|Pin Press|Cale|Board|Close Grip|Wide Grip|Sumo|Conventionnel)\b/i
  const filtered = (data || []).filter(ex => !variantKeywords.test(ex.name))

  return ok(filtered)
}

// POST /api/exercises - créer un exercice custom
const createExerciseSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum([
    'Squat',
    'Hinge',
    'Horizontal Push',
    'Horizontal Pull',
    'Vertical Push',
    'Vertical Pull',
    'Accessoire',
    'Cardio',
  ]),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const body = await request.json()
  const parsed = createExerciseSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  // Vérifier que c'est un coach
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'coach') return ERRORS.FORBIDDEN()

  // Créer l'exercice
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name: parsed.data.name,
      category: parsed.data.category,
      coach_id: user.id,
    })
    .select()
    .single()

  if (error) {
    // Vérifier si c'est un doublon
    if (error.code === '23505') {
      return ERRORS.INVALID('Exercice déjà existant pour cette catégorie')
    }
    console.error('Exercise create error:', error)
    return ERRORS.SERVER()
  }

  return ok(data)
}
