/**
 * Agrégation live des métriques de sets — utilisé par SlotCardV2 (résumé d'un slot)
 * et SeanceModal (totaux séance) pour afficher Tonnage / NL / E1RM / CS / PS / TS
 * sans attendre le PATCH API.
 *
 * Règles :
 *   - Fallback per-field actual → prescribed : chaque champ pioche sa valeur
 *     dans `actual` si présente, sinon dans `prescribed`. Stress et tonnage
 *     peuvent donc s'afficher dès qu'on a leurs inputs requis (resp. reps+rpe,
 *     weight+reps), même partiellement remplis.
 *   - Clamp DB-style sur out-of-range — voir computeSetMetrics.
 */

import { computeSetMetrics, type SetMetrics } from './rts-calc'

/** Sous-ensemble structurel d'un set draft — découplé de SlotCardV2 pour éviter un cycle d'imports. */
interface SetDraftLike {
  weight_prescribed_kg: string
  reps_prescribed: string
  rpe_prescribed: string
  weight_actual_kg: string
  reps_actual: string
  rpe_actual: string
  central_stress?: number | null
  peripheral_stress?: number | null
  total_stress?: number | null
  central_stress_prescribed?: number | null
  peripheral_stress_prescribed?: number | null
  total_stress_prescribed?: number | null
  impulse_prescribed?: number | null
  impulse_actual?: number | null
}

/** Pioche la valeur actual si valide, sinon prescribed, sinon `null`. */
function pickField(actual: string, prescribed: string, parser: (v: string) => number): number | null {
  const va = parser(actual)
  if (Number.isFinite(va)) return va
  const vp = parser(prescribed)
  return Number.isFinite(vp) ? vp : null
}

/** Triplet (weight, reps, rpe) effectif après fallback per-field. */
export function effectiveTriplet(s: SetDraftLike): {
  weight: number | null
  reps: number | null
  rpe: number | null
} {
  return {
    weight: pickField(s.weight_actual_kg, s.weight_prescribed_kg, parseFloat),
    reps: pickField(s.reps_actual, s.reps_prescribed, parseInt),
    rpe: pickField(s.rpe_actual, s.rpe_prescribed, parseFloat),
  }
}

export interface SlotAggregate {
  e1rm: number | null
  tonnage: number | null
  tonnagePrescribed: number | null
  nl: number | null
  nlPrescribed: number | null
  cs: number | null
  ps: number | null
  ts: number | null
  csPrescribed: number | null
  psPrescribed: number | null
  tsPrescribed: number | null
  impulsePrescribed: number | null
  impulseActual: number | null
}

/**
 * Agrège les métriques pour un slot (tableau de sets).
 *  - e1rm  : max sur les sets (un set sans triplet complet est ignoré)
 *  - tonnage / cs / ps / ts : somme (les undefined comptent comme 0)
 *  - cs/ps/ts_prescribed : somme des stress prescrits (depuis DB ou fallback)
 *  - impulse_prescribed / impulse_actual : somme des impulses
 *  - nl    : somme des reps effectifs (fallback inclus)
 *
 * Retourne `null` pour chaque métrique entièrement vide afin que l'UI puisse
 * afficher "—" plutôt qu'un zéro trompeur.
 */
export function aggregateSlot(sets: SetDraftLike[]): SlotAggregate {
  const perRow = sets.map((s) => computeSetMetrics(effectiveTriplet(s)))
  const e1rms = perRow.map((m) => m.e1rm).filter((v): v is number => v != null)
  const sumKey = (k: keyof SetMetrics) =>
    perRow.reduce((acc, m) => acc + ((m[k] as number | undefined) ?? 0), 0)
  const nl = sets.reduce((acc, s) => acc + (effectiveTriplet(s).reps ?? 0), 0)

  // Sum actual stress (from DB or calculated live)
  const cs = sumKey('centralStress') || null
  const ps = sumKey('peripheralStress') || null
  const ts = sumKey('totalStress') || null

  // Sum prescribed stress (from DB, or use effective triplet calculation as fallback)
  const csPrescribed = sets.reduce((acc, s) => {
    if (s.central_stress_prescribed != null) return acc + s.central_stress_prescribed
    // Fallback: calculate from prescribed triplet
    const prescribed = {
      weight: parseFloat(s.weight_prescribed_kg),
      reps: parseInt(s.reps_prescribed, 10),
      rpe: parseFloat(s.rpe_prescribed),
    }
    if (Number.isFinite(prescribed.reps) && Number.isFinite(prescribed.rpe)) {
      const calc = computeSetMetrics(prescribed)
      return acc + (calc.centralStress ?? 0)
    }
    return acc
  }, 0)

  const psPrescribed = sets.reduce((acc, s) => {
    if (s.peripheral_stress_prescribed != null) return acc + s.peripheral_stress_prescribed
    const prescribed = {
      weight: parseFloat(s.weight_prescribed_kg),
      reps: parseInt(s.reps_prescribed, 10),
      rpe: parseFloat(s.rpe_prescribed),
    }
    if (Number.isFinite(prescribed.reps) && Number.isFinite(prescribed.rpe)) {
      const calc = computeSetMetrics(prescribed)
      return acc + (calc.peripheralStress ?? 0)
    }
    return acc
  }, 0)

  const tsPrescribed = sets.reduce((acc, s) => {
    if (s.total_stress_prescribed != null) return acc + s.total_stress_prescribed
    const prescribed = {
      weight: parseFloat(s.weight_prescribed_kg),
      reps: parseInt(s.reps_prescribed, 10),
      rpe: parseFloat(s.rpe_prescribed),
    }
    if (Number.isFinite(prescribed.reps) && Number.isFinite(prescribed.rpe)) {
      const calc = computeSetMetrics(prescribed)
      return acc + (calc.totalStress ?? 0)
    }
    return acc
  }, 0)

  // Sum impulses (from DB or calculate live with client-side formula)
  const impulsePrescribed = sets.reduce((acc, s) => {
    if (s.impulse_prescribed != null) return acc + s.impulse_prescribed
    // Fallback: calculate from prescribed triplet
    const prescribed = {
      weight: parseFloat(s.weight_prescribed_kg),
      reps: parseInt(s.reps_prescribed, 10),
      rpe: parseFloat(s.rpe_prescribed),
    }
    const calc = computeSetMetrics(prescribed)
    return acc + (calc.impulse ?? 0)
  }, 0)

  const impulseActual = sets.reduce((acc, s) => {
    if (s.impulse_actual != null) return acc + s.impulse_actual
    // Fallback: calculate from actual triplet
    const actual = {
      weight: parseFloat(s.weight_actual_kg),
      reps: parseInt(s.reps_actual, 10),
      rpe: parseFloat(s.rpe_actual),
    }
    const calc = computeSetMetrics(actual)
    return acc + (calc.impulse ?? 0)
  }, 0)

  // Calculate prescribed tonnage + NL
  const tonnagePrescribed = sets.reduce((acc, s) => {
    const w = parseFloat(s.weight_prescribed_kg)
    const r = parseInt(s.reps_prescribed, 10)
    if (Number.isFinite(w) && Number.isFinite(r) && w > 0) {
      return acc + (w * r)
    }
    return acc
  }, 0)

  const nlPrescribed = sets.reduce((acc, s) => {
    const r = parseInt(s.reps_prescribed, 10)
    return acc + (Number.isFinite(r) ? r : 0)
  }, 0)

  return {
    e1rm: e1rms.length ? Math.max(...e1rms) : null,
    tonnage: sumKey('volumeLoad') || null,
    tonnagePrescribed: tonnagePrescribed || null,
    nl: nl || null,
    nlPrescribed: nlPrescribed || null,
    cs,
    ps,
    ts,
    csPrescribed: csPrescribed || null,
    psPrescribed: psPrescribed || null,
    tsPrescribed: tsPrescribed || null,
    impulsePrescribed: impulsePrescribed || null,
    impulseActual: impulseActual || null,
  }
}

/** Agrège les métriques pour une séance complète (plusieurs slots, à plat). */
export function aggregateMany(slots: { sets: SetDraftLike[] }[]): SlotAggregate {
  return aggregateSlot(slots.flatMap((s) => s.sets))
}
