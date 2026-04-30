import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ok, ERRORS } from '@/lib/api-helpers'
import { z } from 'zod'

/**
 * POST /api/blocks/[id]/generate
 *
 * Crée des séances pour les semaines 2..N en dupliquant un template (semaine 1).
 * Body :
 *   {
 *     template_week: 1,                      // semaine source (par défaut 1)
 *     target_weeks: number[],                // ex: [2, 3, 4]  → semaines à générer
 *     overwrite?: boolean                    // si true, supprime d'abord les séances existantes des semaines cibles
 *   }
 *
 * Idempotent par défaut (overwrite=false) : si une séance existe déjà sur (block, week, session_number),
 * on saute la duplication.
 */
const schema = z.object({
  template_week: z.number().int().min(1).max(20).default(1),
  target_weeks: z.array(z.number().int().min(1).max(20)).min(1),
  overwrite: z.boolean().optional().default(false),
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

  const { id } = await params
  const { data: block } = await supabase
    .from('blocks')
    .select('id, coach_id, athlete_id, start_date')
    .eq('id', id)
    .single()
  if (!block) return ERRORS.NOT_FOUND('Bloc')
  if (block.coach_id !== user.id) return ERRORS.FORBIDDEN()

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return ERRORS.INVALID(parsed.error.issues[0].message)

  const { template_week, target_weeks, overwrite } = parsed.data

  // Charger les séances du template
  const { data: tmplSessions, error: tErr } = await supabase
    .from('sessions')
    .select('*, sets(*)')
    .eq('block_id', id)
    .eq('week_in_block', template_week)
    .order('session_number', { ascending: true })
    .order('scheduled_date', { ascending: true })

  if (tErr) return ERRORS.SERVER()
  if (!tmplSessions || tmplSessions.length === 0) {
    return ERRORS.INVALID(`Aucune séance trouvée en semaine ${template_week} pour servir de template`)
  }

  // Décalage de date pour chaque semaine cible : weekDelta * 7 jours
  const startDate = new Date(block.start_date + 'T00:00:00Z')
  void startDate

  const created: { week: number; sessions: number }[] = []

  for (const targetWeek of target_weeks) {
    if (targetWeek === template_week) continue

    // Si overwrite : on supprime d'abord les séances existantes de cette semaine cible
    if (overwrite) {
      await supabase
        .from('sessions')
        .delete()
        .eq('block_id', id)
        .eq('week_in_block', targetWeek)
    } else {
      // Skip les séances déjà existantes (même session_number)
      const { data: existing } = await supabase
        .from('sessions')
        .select('session_number')
        .eq('block_id', id)
        .eq('week_in_block', targetWeek)
      const existingNums = new Set((existing ?? []).map(s => s.session_number))
      if (existingNums.size === tmplSessions.length) {
        // Toutes les séances existent déjà → rien à faire
        created.push({ week: targetWeek, sessions: 0 })
        continue
      }
    }

    let createdCount = 0
    for (const tmpl of tmplSessions) {
      // Calcule la date cible : on garde le même jour de la semaine, en ajoutant
      // (targetWeek - template_week) * 7 jours.
      const tmplDate = new Date(tmpl.scheduled_date + 'T00:00:00Z')
      const diff = (targetWeek - template_week) * 7
      const newDate = new Date(tmplDate)
      newDate.setUTCDate(tmplDate.getUTCDate() + diff)
      const newDateStr = newDate.toISOString().slice(0, 10)

      // Si non-overwrite + skip si la session_number existe déjà
      if (!overwrite) {
        const { data: dup } = await supabase
          .from('sessions')
          .select('id')
          .eq('block_id', id)
          .eq('week_in_block', targetWeek)
          .eq('session_number', tmpl.session_number ?? 0)
          .maybeSingle()
        if (dup) continue
      }

      const { data: newSession, error: insErr } = await supabase
        .from('sessions')
        .insert({
          athlete_id: block.athlete_id,
          coach_id: block.coach_id,
          block_id: id,
          scheduled_date: newDateStr,
          week_in_block: targetWeek,
          session_number: tmpl.session_number,
          notes_coach: tmpl.notes_coach,
          status: 'prescribed' as const,
        })
        .select()
        .single()

      if (insErr || !newSession) continue
      createdCount++

      // Dupliquer les sets (prescription seulement, pas le réalisé)
      const tmplSets = ((tmpl as { sets?: unknown }).sets ?? []) as unknown as Array<{
        exercise_name: string
        exercise_format: string | null
        set_number: number
        weight_prescribed_kg: number | null
        reps_prescribed: number | null
        rpe_prescribed: number | null
        tempo: string | null
        rom_prescribed: string | null
      }>

      if (tmplSets.length > 0) {
        await supabase.from('sets').insert(
          tmplSets.map(s => ({
            session_id: newSession.id,
            exercise_name: s.exercise_name,
            exercise_format: s.exercise_format,
            set_number: s.set_number,
            weight_prescribed_kg: s.weight_prescribed_kg,
            reps_prescribed: s.reps_prescribed,
            rpe_prescribed: s.rpe_prescribed,
            tempo: s.tempo,
            rom_prescribed: s.rom_prescribed,
          })),
        )
      }
    }

    created.push({ week: targetWeek, sessions: createdCount })
  }

  return ok({ generated: created }, 201)
}
