/**
 * Synchronisation S1 → S2..SN basée sur la table `block_progression_config`.
 *
 * Modèle déclaratif : pour chaque exercice, les deltas (poids/reps/RPE/séries)
 * stockés en DB sont appliqués CUMULATIVEMENT depuis S1 — pas chaînés semaine à
 * semaine. Cela garantit que toute modif de S1 se répercute correctement.
 *
 *   S(k) = S1 + (k-1) × delta            (k = numéro de semaine, k=1..N)
 *
 * Préserve les champs `*_actual` (réalisé athlète) et `e1rm_kg` /
 * `rpe_realization_pct` (calculés par trigger SQL).
 */

import type { Database } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import { recommendLoad, roundToStep, estimateE1RM } from './rts-calc'

type Supabase = SupabaseClient<Database>

type ProgressionConfig = {
  exercise_name: string
  weight_enabled: boolean
  weight_delta: number
  weight_type: 'kg' | 'percent'
  reps_delta: number
  rpe_delta: number
  sets_delta: number
  copy_modifiers: boolean
  detect_overperformance: boolean
}

const DEFAULT_CFG: Omit<ProgressionConfig, 'exercise_name'> = {
  weight_enabled: false,
  weight_delta: 0,
  weight_type: 'kg',
  reps_delta: 0,
  rpe_delta: 0,
  sets_delta: 0,
  copy_modifiers: true,
  detect_overperformance: true,
}

export interface SyncOpts {
  template_week?: number
  target_weeks?: number[]
  use_e1rm?: boolean
  remove_orphans?: boolean
}

export interface SyncResult {
  sessions_created: number
  sessions_deleted: number
  sets_created: number
  sets_updated: number
  sets_deleted: number
}

type S1Set = {
  id: string
  exercise_name: string | null
  exercise_format: string | null
  set_number: number
  weight_prescribed_kg: number | null
  reps_prescribed: number | null
  rpe_prescribed: number | null
  tempo: string | null
  rom_prescribed: string | null
  rpe_realization_pct: number | null
}

type S1Session = {
  id: string
  session_number: number | null
  scheduled_date: string
  notes_coach: string | null
  sets: S1Set[]
}

type TargetSet = {
  id: string
  exercise_name: string | null
  set_number: number
  weight_prescribed_kg: number | null
  reps_prescribed: number | null
  rpe_prescribed: number | null
  tempo: string | null
  rom_prescribed: string | null
  exercise_format: string | null
}

type TargetSession = {
  id: string
  session_number: number | null
  sets: TargetSet[]
}

export async function applyS1ToWeeks(
  supabase: Supabase,
  blockId: string,
  opts: SyncOpts = {},
): Promise<SyncResult> {
  const template_week = opts.template_week ?? 1
  const use_e1rm = opts.use_e1rm ?? false
  const remove_orphans = opts.remove_orphans ?? true

  const { data: block } = await supabase
    .from('blocks')
    .select('id, athlete_id, coach_id, start_date, total_weeks')
    .eq('id', blockId)
    .single()
  if (!block) throw new Error('Block not found')

  const totalWeeks = block.total_weeks ?? 4
  const target_weeks =
    opts.target_weeks ??
    Array.from({ length: Math.max(0, totalWeeks - 1) }, (_, i) => i + 2)

  const empty: SyncResult = {
    sessions_created: 0,
    sessions_deleted: 0,
    sets_created: 0,
    sets_updated: 0,
    sets_deleted: 0,
  }
  if (target_weeks.length === 0) return empty

  // Charger sessions S1 + leurs sets
  const { data: rawS1Sessions } = await supabase
    .from('sessions')
    .select(
      'id, session_number, scheduled_date, notes_coach, sets(id, exercise_name, exercise_format, set_number, weight_prescribed_kg, reps_prescribed, rpe_prescribed, tempo, rom_prescribed, rpe_realization_pct)',
    )
    .eq('block_id', blockId)
    .eq('week_in_block', template_week)
    .order('session_number', { ascending: true })

  const s1Sessions = (rawS1Sessions ?? []) as unknown as S1Session[]
  if (s1Sessions.length === 0) return empty

  // Charger configs persistées
  const { data: rawConfigs } = await supabase
    .from('block_progression_config')
    .select('*')
    .eq('block_id', blockId)
  const configs = (rawConfigs ?? []) as ProgressionConfig[]
  const configMap = new Map<string, ProgressionConfig>(
    configs.map((c) => [c.exercise_name, c]),
  )

  // Charger E1RM réel (table `exercise_e1rm` — alimentée par trigger DB
  // depuis l'actual). Toujours chargé : sert aussi de fallback quand reps/rpe
  // delta non-nul même si `use_e1rm` n'est pas explicitement demandé.
  const e1rmMap = new Map<string, number>()
  const { data: e1rmRows } = await supabase
    .from('exercise_e1rm')
    .select('exercise_name, e1rm_kg')
    .eq('athlete_id', block.athlete_id)
  for (const r of e1rmRows ?? []) {
    e1rmMap.set(r.exercise_name, r.e1rm_kg)
  }

  // Fallback : si pas d'E1RM réel pour un exercice, estimer depuis les
  // prescriptions S1 (max sur tous les sets prescrits de l'exercice).
  // Cela permet de calculer correctement les charges S2..SN dès que le coach
  // prescrit S1, sans attendre que l'athlète logue l'actual.
  const s1EstimatedE1RM = new Map<string, number>()
  for (const sess of s1Sessions) {
    for (const s of sess.sets) {
      if (
        !s.exercise_name ||
        s.weight_prescribed_kg == null ||
        s.reps_prescribed == null ||
        s.rpe_prescribed == null
      ) {
        continue
      }
      const est = estimateE1RM(s.weight_prescribed_kg, s.reps_prescribed, s.rpe_prescribed)
      if (est == null) continue
      const cur = s1EstimatedE1RM.get(s.exercise_name) ?? 0
      if (est > cur) s1EstimatedE1RM.set(s.exercise_name, est)
    }
  }

  // E1RM effectif par exercice : actual > estimé S1
  const effectiveE1RM = (exoName: string): number | undefined => {
    return e1rmMap.get(exoName) ?? s1EstimatedE1RM.get(exoName)
  }

  const result: SyncResult = { ...empty }

  // Pour chaque semaine cible : sync sessions + sets
  for (const targetWeek of target_weeks) {
    if (targetWeek === template_week) continue
    const weekDelta = targetWeek - template_week

    // Sessions existantes en target week + leurs sets
    const { data: rawTargetSessions } = await supabase
      .from('sessions')
      .select(
        'id, session_number, sets(id, exercise_name, set_number, weight_prescribed_kg, reps_prescribed, rpe_prescribed, tempo, rom_prescribed, exercise_format)',
      )
      .eq('block_id', blockId)
      .eq('week_in_block', targetWeek)

    const targetSessions = (rawTargetSessions ?? []) as unknown as TargetSession[]
    const targetSessionMap = new Map<number, TargetSession>(
      targetSessions.map((s) => [s.session_number ?? 0, s]),
    )

    const s1SessionNums = new Set<number>()

    for (const s1Sess of s1Sessions) {
      const sn = s1Sess.session_number ?? 0
      s1SessionNums.add(sn)
      let targetSession = targetSessionMap.get(sn)

      if (!targetSession) {
        const tmplDate = new Date(s1Sess.scheduled_date + 'T00:00:00Z')
        tmplDate.setUTCDate(tmplDate.getUTCDate() + weekDelta * 7)
        const newDateStr = tmplDate.toISOString().slice(0, 10)
        const { data: newSess } = await supabase
          .from('sessions')
          .insert({
            athlete_id: block.athlete_id,
            coach_id: block.coach_id,
            block_id: blockId,
            scheduled_date: newDateStr,
            week_in_block: targetWeek,
            session_number: s1Sess.session_number,
            notes_coach: s1Sess.notes_coach,
            status: 'prescribed' as const,
          })
          .select('id, session_number')
          .single()
        if (!newSess) continue
        targetSession = {
          id: newSess.id,
          session_number: newSess.session_number,
          sets: [],
        }
        targetSessionMap.set(sn, targetSession)
        result.sessions_created++
      }

      // Grouper sets S1 par exercice (set_number croissant)
      const setsByExo = new Map<string, S1Set[]>()
      for (const s of s1Sess.sets) {
        if (!s.exercise_name) continue
        const arr = setsByExo.get(s.exercise_name) ?? []
        arr.push(s)
        setsByExo.set(s.exercise_name, arr)
      }
      for (const arr of Array.from(setsByExo.values())) {
        arr.sort((a: S1Set, b: S1Set) => a.set_number - b.set_number)
      }

      const targetSetMap = new Map<string, TargetSet>(
        targetSession.sets.map((ts) => [
          `${ts.exercise_name ?? ''}|${ts.set_number}`,
          ts,
        ]),
      )

      const expectedKeys = new Set<string>()

      for (const [exoName, exoS1Sets] of Array.from(setsByExo.entries())) {
        const cfg: ProgressionConfig =
          configMap.get(exoName) ?? { exercise_name: exoName, ...DEFAULT_CFG }
        const s1Count = exoS1Sets.length
        const targetCount = Math.max(1, s1Count + weekDelta * cfg.sets_delta)
        const e1rm = effectiveE1RM(exoName)

        for (let i = 0; i < targetCount; i++) {
          // Hors plage S1 → on duplique le dernier set S1 (cas sets_delta > 0)
          const s1Set = exoS1Sets[Math.min(i, s1Count - 1)]
          const setNumber = i + 1
          const key = `${exoName}|${setNumber}`
          expectedKeys.add(key)

          const computed = computeTarget(s1Set, cfg, weekDelta, use_e1rm, e1rm)
          const existing = targetSetMap.get(key)

          if (existing) {
            const updateData: Database['public']['Tables']['sets']['Update'] = {
              weight_prescribed_kg: computed.weight,
              reps_prescribed: computed.reps,
              rpe_prescribed: computed.rpe,
            }
            if (cfg.copy_modifiers) {
              updateData.tempo = s1Set.tempo
              updateData.rom_prescribed = s1Set.rom_prescribed
              updateData.exercise_format = s1Set.exercise_format
            }
            const dirty = Object.entries(updateData).some(([k, v]) => {
              const cur = (existing as unknown as Record<string, unknown>)[k]
              return cur !== v
            })
            if (dirty) {
              await supabase.from('sets').update(updateData).eq('id', existing.id)
              result.sets_updated++
            }
          } else {
            await supabase.from('sets').insert({
              session_id: targetSession.id,
              exercise_name: exoName,
              exercise_format: s1Set.exercise_format,
              set_number: setNumber,
              weight_prescribed_kg: computed.weight,
              reps_prescribed: computed.reps,
              rpe_prescribed: computed.rpe,
              tempo: s1Set.tempo,
              rom_prescribed: s1Set.rom_prescribed,
            })
            result.sets_created++
          }
        }
      }

      // Supprimer sets cibles qui n'ont plus d'équivalent S1
      if (remove_orphans) {
        for (const ts of targetSession.sets) {
          const key = `${ts.exercise_name ?? ''}|${ts.set_number}`
          if (!expectedKeys.has(key)) {
            await supabase.from('sets').delete().eq('id', ts.id)
            result.sets_deleted++
          }
        }
      }
    }

    // Supprimer sessions cibles dont session_number n'est plus en S1
    if (remove_orphans) {
      for (const [sn, ts] of Array.from(targetSessionMap.entries())) {
        if (!s1SessionNums.has(sn)) {
          await supabase.from('sessions').delete().eq('id', ts.id)
          result.sessions_deleted++
        }
      }
    }
  }

  // Supprimer configs orphelines (exercice retiré de S1)
  if (remove_orphans && configs.length > 0) {
    const s1Exercises = new Set<string>()
    for (const sess of s1Sessions) {
      for (const set of sess.sets) {
        if (set.exercise_name) s1Exercises.add(set.exercise_name)
      }
    }
    const orphanIds = configs
      .filter((c) => !s1Exercises.has(c.exercise_name))
      .map((c) => (c as unknown as { id: string }).id)
    if (orphanIds.length > 0) {
      await supabase.from('block_progression_config').delete().in('id', orphanIds)
    }
  }

  return result
}

function computeTarget(
  s1Set: S1Set,
  cfg: ProgressionConfig,
  weekDelta: number,
  use_e1rm: boolean,
  e1rm: number | undefined,
): { weight: number | null; reps: number | null; rpe: number | null } {
  const s1Weight = s1Set.weight_prescribed_kg
  const s1Reps = s1Set.reps_prescribed
  const s1Rpe = s1Set.rpe_prescribed

  const newReps =
    s1Reps !== null ? Math.max(1, s1Reps + weekDelta * cfg.reps_delta) : s1Reps

  const newRpe =
    s1Rpe !== null
      ? clamp(5, 10, roundHalf(s1Rpe + weekDelta * cfg.rpe_delta))
      : s1Rpe

  let newWeight = s1Weight
  const repsChanged = cfg.reps_delta !== 0
  const rpeChanged = cfg.rpe_delta !== 0

  if (cfg.weight_enabled && s1Weight !== null) {
    // Delta weight explicite — l'utilisateur prend la main
    let deltaTerm =
      cfg.weight_type === 'kg'
        ? weekDelta * cfg.weight_delta
        : (s1Weight * weekDelta * cfg.weight_delta) / 100
    if (cfg.detect_overperformance && (s1Set.rpe_realization_pct ?? 0) > 110) {
      deltaTerm *= 0.8
    }
    newWeight = s1Weight + deltaTerm
  } else if ((repsChanged || rpeChanged || use_e1rm) && e1rm && e1rm > 0 && newReps && newRpe) {
    // Reps/RPE modifiés (ou use_e1rm explicite) → recalc charge via E1RM
    const rec = recommendLoad(e1rm, newReps, newRpe)
    if (rec) newWeight = rec
  }

  if (newWeight !== null && newWeight !== undefined) {
    newWeight = roundToStep(newWeight, 2.5)
  }

  return { weight: newWeight, reps: newReps, rpe: newRpe }
}

function clamp(min: number, max: number, v: number) {
  return Math.min(max, Math.max(min, v))
}

function roundHalf(v: number) {
  return Math.round(v * 2) / 2
}
