import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'
import { applyS1ToWeeks } from '@/lib/progression-sync'

/**
 * POST /api/blocks/[id]/progress-week
 *
 * Persiste la config de progression pour un exercice (deltas semaine→semaine)
 * dans `block_progression_config`, puis re-synchronise S2..SN depuis S1.
 *
 * Modèle déclaratif : S(k) = S1 + (k-1) × deltas (cumulatif, pas chaîné).
 *
 * Body :
 *   {
 *     exercise_name: string
 *     weight_enabled?: boolean       (défaut false)
 *     weight_delta?: number          (défaut 0)
 *     weight_type?: 'kg' | 'percent' (défaut 'kg')
 *     reps_delta?: number            (défaut 0)
 *     rpe_delta?: number             (défaut 0, multiple de 0.5)
 *     sets_delta?: number            (défaut 0)
 *     copy_modifiers?: boolean       (défaut true)
 *     detect_overperformance?: boolean (défaut true)
 *   }
 */
const schema = z.object({
  exercise_name: z.string().min(1).max(100),
  weight_enabled: z.boolean().optional().default(false),
  weight_delta: z.number().optional().default(0),
  weight_type: z.enum(['kg', 'percent']).optional().default('kg'),
  reps_delta: z.number().int().optional().default(0),
  rpe_delta: z.number().multipleOf(0.5).optional().default(0),
  sets_delta: z.number().int().optional().default(0),
  copy_modifiers: z.boolean().optional().default(true),
  detect_overperformance: z.boolean().optional().default(true),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id: blockId } = await params

  const { data: block } = await supabase
    .from('blocks')
    .select('id, coach_id')
    .eq('id', blockId)
    .single()
  if (!block) return ERRORS.NOT_FOUND('Bloc')
  if (block.coach_id !== user.id) return ERRORS.FORBIDDEN()

  const body = await request.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  const cfg = parsed.data

  // Upsert config (UNIQUE block_id + exercise_name)
  const { error: upsertErr } = await supabase
    .from('block_progression_config')
    .upsert(
      {
        block_id: blockId,
        exercise_name: cfg.exercise_name,
        weight_enabled: cfg.weight_enabled,
        weight_delta: cfg.weight_delta,
        weight_type: cfg.weight_type,
        reps_delta: cfg.reps_delta,
        rpe_delta: cfg.rpe_delta,
        sets_delta: cfg.sets_delta,
        copy_modifiers: cfg.copy_modifiers,
        detect_overperformance: cfg.detect_overperformance,
      },
      { onConflict: 'block_id,exercise_name' },
    )
  if (upsertErr) return ERRORS.SERVER()

  // Re-synchroniser S2..SN avec les configs mises à jour
  try {
    const result = await applyS1ToWeeks(supabase, blockId, {
      use_e1rm: true,
      remove_orphans: true,
    })
    return ok({ success: true, ...result })
  } catch {
    return ERRORS.SERVER()
  }
}

/**
 * GET /api/blocks/[id]/progress-week?exercise=...
 *
 * Renvoie la config persistée pour l'exercice (ou null si pas de config).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return ERRORS.UNAUTHORIZED()

  const { id: blockId } = await params
  const exerciseName = request.nextUrl.searchParams.get('exercise')
  if (!exerciseName) return ERRORS.INVALID('exercise requis')

  const { data: block } = await supabase
    .from('blocks')
    .select('id, coach_id, athlete_id')
    .eq('id', blockId)
    .single()
  if (!block) return ERRORS.NOT_FOUND('Bloc')
  if (block.coach_id !== user.id && block.athlete_id !== user.id) {
    return ERRORS.FORBIDDEN()
  }

  const { data } = await supabase
    .from('block_progression_config')
    .select('*')
    .eq('block_id', blockId)
    .eq('exercise_name', exerciseName)
    .maybeSingle()

  return ok(data ?? null)
}
