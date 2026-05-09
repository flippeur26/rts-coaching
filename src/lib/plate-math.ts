/**
 * plate-math — calculs d'arrondi de charge en fonction des disques disponibles.
 *
 * Convention : tout est en kg (la conversion en lbs se fait à l'affichage uniquement).
 *
 * Algorithme : on cherche la somme la plus proche de (target - bar - colliers) / 2
 * (par côté de barre) en utilisant les disques disponibles, puis on remultiplie par 2
 * et on rajoute la barre + colliers.
 */

export interface PlateSettings {
  bar_weight_kg: number
  collar_weight_kg: number
  available_plates_kg: number[]
}

const DEFAULT_SETTINGS: PlateSettings = {
  bar_weight_kg: 20,
  collar_weight_kg: 0,
  available_plates_kg: [25, 20, 15, 10, 5, 2.5, 1.5, 1.25, 1, 0.5],
}

/**
 * Trouve la combinaison de disques par côté qui donne le poids le plus proche
 * du target (en kg). Retourne le poids total (barre + colliers + 2*plates).
 *
 * Permet plusieurs disques identiques (ex : 2× 25kg par côté).
 *
 * Algorithme : DP sur "poids par côté" avec pas de 0.25 kg jusqu'à target/2 + 25.
 */
export function roundToAvailablePlates(
  targetKg: number,
  settings: Partial<PlateSettings> = {},
): number {
  const s: PlateSettings = { ...DEFAULT_SETTINGS, ...settings }

  if (!Number.isFinite(targetKg) || targetKg <= 0) return 0
  if (s.available_plates_kg.length === 0) return targetKg

  const fixedWeight = s.bar_weight_kg + s.collar_weight_kg * 2
  const targetPerSide = (targetKg - fixedWeight) / 2

  // Si target < barre nue → retourne juste la barre (pas de plates)
  if (targetPerSide <= 0) return s.bar_weight_kg

  // DP sur somme par côté avec pas de 0.25 kg
  // (suffisant : tous les disques courants sont des multiples de 0.25)
  const STEP = 0.25
  const ceiling = Math.ceil((targetPerSide + 25) / STEP) * STEP // 25kg de marge
  const stepsCeiling = Math.round(ceiling / STEP)

  // reachable[i] = true si on peut atteindre i*STEP par côté
  const reachable = new Uint8Array(stepsCeiling + 1)
  reachable[0] = 1

  for (const plate of s.available_plates_kg) {
    const plateSteps = Math.round(plate / STEP)
    if (plateSteps <= 0) continue
    for (let i = plateSteps; i <= stepsCeiling; i++) {
      if (reachable[i - plateSteps]) reachable[i] = 1
    }
  }

  // Trouve la valeur reachable la plus proche de targetPerSide
  const targetSteps = Math.round(targetPerSide / STEP)
  let best = 0
  let bestDelta = Infinity
  for (let i = 0; i <= stepsCeiling; i++) {
    if (!reachable[i]) continue
    const delta = Math.abs(i - targetSteps)
    if (delta < bestDelta) {
      bestDelta = delta
      best = i
      if (delta === 0) break
    }
  }

  const perSide = best * STEP
  return roundTo2(fixedWeight + perSide * 2)
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Conversion kg ↔ lbs (affichage uniquement).
 * 1 kg = 2.20462 lbs
 */
export function kgToLbs(kg: number): number {
  return kg * 2.20462
}

export function lbsToKg(lbs: number): number {
  return lbs / 2.20462
}

/**
 * Formate un poids selon le système d'unités. Stockage = toujours kg.
 */
export function formatWeight(kg: number | null | undefined, unitSystem: 'metric' | 'imperial' = 'metric'): string {
  if (kg == null) return '—'
  if (unitSystem === 'imperial') {
    const lbs = kgToLbs(kg)
    return `${lbs.toFixed(1)} lbs`
  }
  return `${kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(2).replace(/\.?0+$/, '')} kg`
}

export function unitLabel(unitSystem: 'metric' | 'imperial' = 'metric'): string {
  return unitSystem === 'imperial' ? 'lbs' : 'kg'
}
