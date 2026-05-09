/**
 * Calculs RTS côté client.
 *
 * IMPORTANT — la source de vérité reste le trigger PostgreSQL
 * `trg_calculate_set_metrics` qui recalcule e1RM/CS/PS/TS sur chaque set au save.
 *
 * Les helpers ci-dessous servent à deux usages :
 *   1. Workout Planner — recommandation a priori d'une charge à partir d'un e1RM.
 *   2. Recalcul live (pré-save) des métriques agrégées dans SlotCardV2 / SeanceModal,
 *      pour que l'affichage suive les saisies sans attendre le PATCH API.
 *
 * Les tables de lookup sont importées de `rts-lookups.ts` (mirror exact des seeds SQL).
 */

import {
  E1RM_PCT,
  CENTRAL_STRESS,
  PERIPHERAL_STRESS,
  TOTAL_STRESS,
  RPE_MIN,
  RPE_MAX,
  REPS_E1RM_MAX,
  REPS_STRESS_MAX,
} from './rts-lookups'

/** Clamp DB-style : RPE [5, 10] arrondi au 0.5 le plus proche. */
function clampRpe(rpe: number): number {
  return Math.max(RPE_MIN, Math.min(RPE_MAX, Math.round(rpe * 2) / 2))
}

/** %1RM pour (reps, rpe). Clamp reps [1, 12], RPE [5, 10] par 0.5. Retourne en pourcentage (ex: 86.3). */
export function pctOf1RM(reps: number, rpe: number): number | null {
  if (!Number.isFinite(reps) || !Number.isFinite(rpe)) return null
  const r = Math.max(1, Math.min(REPS_E1RM_MAX, Math.round(reps)))
  const decimal = E1RM_PCT[`${clampRpe(rpe)},${r}`]
  return decimal != null ? decimal * 100 : null
}

/** Recommandation de charge depuis un e1RM, reps et RPE cibles. */
export function recommendLoad(e1rm: number, reps: number, rpe: number): number | null {
  const pct = pctOf1RM(reps, rpe)
  if (pct == null) return null
  return (e1rm * pct) / 100
}

/** Arrondit à un palier (par défaut 2.5 kg) — utilisé pour le "Round" du planner. */
export function roundToStep(kg: number, step = 2.5): number {
  return Math.round(kg / step) * step
}

/** Estimation e1RM depuis (poids, reps, rpe) — formule miroir du SQL get_e1rm. */
export function estimateE1RM(weight: number, reps: number, rpe: number): number | null {
  const pct = pctOf1RM(reps, rpe)
  if (pct == null || pct === 0) return null
  return (weight * 100) / pct
}

/** Lookup générique pour les tables de stress (clamp DB-style). */
function lookupStress(table: Record<string, number>, rpe: number, reps: number): number | undefined {
  if (!Number.isFinite(reps) || !Number.isFinite(rpe)) return undefined
  const r = Math.max(1, Math.min(REPS_STRESS_MAX, Math.round(reps)))
  return table[`${clampRpe(rpe)},${r}`]
}

/** Central Stress pour (rpe, reps) — mirror DB get_central_stress. */
export function getCentralStress(rpe: number, reps: number): number | undefined {
  return lookupStress(CENTRAL_STRESS, rpe, reps)
}

/** Peripheral Stress pour (rpe, reps) — mirror DB get_peripheral_stress. */
export function getPeripheralStress(rpe: number, reps: number): number | undefined {
  return lookupStress(PERIPHERAL_STRESS, rpe, reps)
}

/** Total Stress pour (rpe, reps) — mirror DB get_total_stress. */
export function getTotalStress(rpe: number, reps: number): number | undefined {
  return lookupStress(TOTAL_STRESS, rpe, reps)
}

/** Métriques calculables pour un set. Chaque champ est `undefined` si les inputs requis manquent. */
export interface SetMetrics {
  e1rm?: number
  volumeLoad?: number
  impulse?: number
  centralStress?: number
  peripheralStress?: number
  totalStress?: number
}

/**
 * Calcule les métriques d'un set à partir d'un triplet (weight, reps, rpe).
 * Logique par-métrique :
 *   - tonnage (volumeLoad) : weight + reps
 *   - impulse              : weight × (weight/e1rm) × reps
 *   - stress (CS/PS/TS)    : reps + rpe
 *   - e1RM                 : weight + reps + rpe
 *
 * Mirror du trigger DB `trg_calculate_set_metrics`. Out-of-range RPE/reps clampés
 * à la plage de la table (comme la DB) — pas de "—".
 */
export function computeSetMetrics(input: {
  weight: number | null | undefined
  reps: number | null | undefined
  rpe: number | null | undefined
}): SetMetrics {
  const w = typeof input.weight === 'number' && Number.isFinite(input.weight) ? input.weight : undefined
  const r =
    typeof input.reps === 'number' && Number.isFinite(input.reps) && input.reps > 0
      ? Math.round(input.reps)
      : undefined
  const p = typeof input.rpe === 'number' && Number.isFinite(input.rpe) ? input.rpe : undefined

  const volumeLoad = w != null && r != null ? w * r : undefined
  const e1rmRaw = w != null && r != null && p != null ? estimateE1RM(w, r, p) : null
  const e1rm = e1rmRaw != null ? e1rmRaw : undefined

  // Impulse = weight × (weight/e1rm) × reps
  const impulse =
    w != null && r != null && e1rm != null && e1rm > 0
      ? w * (w / e1rm) * r
      : undefined

  const centralStress = r != null && p != null ? getCentralStress(p, r) : undefined
  const peripheralStress = r != null && p != null ? getPeripheralStress(p, r) : undefined
  const totalStress = r != null && p != null ? getTotalStress(p, r) : undefined

  return { e1rm, volumeLoad, impulse, centralStress, peripheralStress, totalStress }
}
