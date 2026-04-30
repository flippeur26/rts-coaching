import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'
import { randomUUID } from 'crypto'

const createSetSchema = z.object({
  exercise_id: z.string().uuid(),
  exercise_name: z.string().min(1),
  target_weight: z.number().nullable().optional(),
  target_reps: z.number().int().min(1).nullable().optional(),
  target_rpe: z.number().min(1).max(10).nullable().optional(),
  order_index: z.number().int().min(0),
})

const createSessionSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sets: z.array(createSetSchema),
})

const createProgrammeSchema = z.object({
  athlete_id: z.string().uuid(),
  program_name: z.string().min(1).max(200),
  block_type: z.enum(['Accumulation', 'Intensification', 'Réalisation', 'Deload']),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sessions: z.array(createSessionSchema),
})

// POST /api/programmes
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'coach') return ERRORS.FORBIDDEN()

  const body = await request.json()
  const parsed = createProgrammeSchema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  // Vérifier que l'athlète appartient à ce coach (lien accepté)
  const { data: rel } = await supabase
    .from('coach_athlete')
    .select('athlete_id')
    .eq('coach_id', user.id)
    .eq('athlete_id', parsed.data.athlete_id)
    .eq('status', 'accepted')
    .single()
  if (!rel) return ERRORS.FORBIDDEN()

  try {
    // 1. Créer le bloc
    const blockId = randomUUID()
    const { error: blockError } = await supabase.from('blocks').insert({
      id: blockId,
      athlete_id: parsed.data.athlete_id,
      coach_id: user.id,
      name: parsed.data.program_name,
      type: parsed.data.block_type,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      total_weeks: Math.ceil(
        (new Date(parsed.data.end_date).getTime() - new Date(parsed.data.start_date).getTime()) /
          (7 * 24 * 60 * 60 * 1000)
      ),
    })

    if (blockError) {
      console.error('Block creation error:', blockError)
      return ERRORS.SERVER()
    }

    // 2. Créer les sessions et sets
    for (const sessionDraft of parsed.data.sessions) {
      const sessionId = randomUUID()

      const { error: sessionError } = await supabase.from('sessions').insert({
        id: sessionId,
        athlete_id: parsed.data.athlete_id,
        coach_id: user.id,
        block_id: blockId,
        scheduled_date: sessionDraft.date,
        status: 'prescribed',
      })

      if (sessionError) {
        console.error('Session creation error:', sessionError)
        return ERRORS.SERVER()
      }

      // 3. Créer les sets pour cette session
      const setsToInsert = sessionDraft.sets.map((set, idx) => ({
        session_id: sessionId,
        exercise_name: set.exercise_name,
        set_number: idx + 1,
        weight_prescribed_kg: set.target_weight || null,
        reps_prescribed: set.target_reps || null,
        rpe_prescribed: set.target_rpe || null,
      }))

      if (setsToInsert.length > 0) {
        const { error: setsError } = await supabase.from('sets').insert(setsToInsert)

        if (setsError) {
          console.error('Sets creation error:', setsError)
          return ERRORS.SERVER()
        }
      }
    }

    return ok({ block_id: blockId, message: 'Programme créé avec succès' })
  } catch (error) {
    console.error('Programme creation error:', error)
    return ERRORS.SERVER()
  }
}
