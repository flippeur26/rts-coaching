/**
 * Calculs RTS côté client (recommandation de charge).
 *
 * IMPORTANT — la source de vérité reste le trigger PostgreSQL
 * `trg_calculate_set_metrics` qui recalcule e1RM/CS/PS/TS sur chaque set.
 * Ce module sert UNIQUEMENT au "Workout Planner" (suggestion de charge à partir
 * d'un e1RM connu, de reps cibles et d'un RPE/percentage cible).
 *
 * Référence : table d'estimation %1RM ↔ (reps, RPE) inspirée de
 * Tuchscherer / Reactive Training Systems.
 */

/** %1RM pour (reps, RPE) — table simplifiée 1–12 reps × RPE 6 → 10 (pas de 0.5) */
const RPE_CHART: Record<string, number> = {
  // reps,rpe → %1RM
  '1,10': 100, '1,9.5': 97.8, '1,9': 95.5, '1,8.5': 93.9, '1,8': 92.2, '1,7.5': 90.7, '1,7': 89.2, '1,6.5': 87.8, '1,6': 86.3,
  '2,10': 95.5, '2,9.5': 93.9, '2,9': 92.2, '2,8.5': 90.7, '2,8': 89.2, '2,7.5': 87.8, '2,7': 86.3, '2,6.5': 85.0, '2,6': 83.7,
  '3,10': 92.2, '3,9.5': 90.7, '3,9': 89.2, '3,8.5': 87.8, '3,8': 86.3, '3,7.5': 85.0, '3,7': 83.7, '3,6.5': 82.3, '3,6': 81.1,
  '4,10': 89.2, '4,9.5': 87.8, '4,9': 86.3, '4,8.5': 85.0, '4,8': 83.7, '4,7.5': 82.3, '4,7': 81.1, '4,6.5': 79.9, '4,6': 78.6,
  '5,10': 86.3, '5,9.5': 85.0, '5,9': 83.7, '5,8.5': 82.3, '5,8': 81.1, '5,7.5': 79.9, '5,7': 78.6, '5,6.5': 77.4, '5,6': 76.2,
  '6,10': 83.7, '6,9.5': 82.3, '6,9': 81.1, '6,8.5': 79.9, '6,8': 78.6, '6,7.5': 77.4, '6,7': 76.2, '6,6.5': 75.1, '6,6': 73.9,
  '7,10': 81.1, '7,9.5': 79.9, '7,9': 78.6, '7,8.5': 77.4, '7,8': 76.2, '7,7.5': 75.1, '7,7': 73.9, '7,6.5': 72.3, '7,6': 70.7,
  '8,10': 78.6, '8,9.5': 77.4, '8,9': 76.2, '8,8.5': 75.1, '8,8': 73.9, '8,7.5': 72.3, '8,7': 70.7, '8,6.5': 69.4, '8,6': 68.0,
  '9,10': 76.2, '9,9.5': 75.1, '9,9': 73.9, '9,8.5': 72.3, '9,8': 70.7, '9,7.5': 69.4, '9,7': 68.0, '9,6.5': 66.7, '9,6': 65.3,
  '10,10': 73.9, '10,9.5': 72.3, '10,9': 70.7, '10,8.5': 69.4, '10,8': 68.0, '10,7.5': 66.7, '10,7': 65.3, '10,6.5': 64.0, '10,6': 62.6,
  '11,10': 70.7, '11,9.5': 69.4, '11,9': 68.0, '11,8.5': 66.7, '11,8': 65.3, '11,7.5': 64.0, '11,7': 62.6, '11,6.5': 61.3, '11,6': 59.9,
  '12,10': 68.0, '12,9.5': 66.7, '12,9': 65.3, '12,8.5': 64.0, '12,8': 62.6, '12,7.5': 61.3, '12,7': 59.9, '12,6.5': 58.6, '12,6': 57.2,
}

/** Renvoie le %1RM pour (reps, rpe). Borné à [1, 12] reps et [6, 10] RPE par 0.5. */
export function pctOf1RM(reps: number, rpe: number): number | null {
  if (!Number.isFinite(reps) || !Number.isFinite(rpe)) return null
  const r = Math.max(1, Math.min(12, Math.round(reps)))
  const rpeKey = Math.max(6, Math.min(10, Math.round(rpe * 2) / 2))
  return RPE_CHART[`${r},${rpeKey}`] ?? null
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
