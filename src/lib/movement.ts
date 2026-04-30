/**
 * Mapping catégorie d'exercice → tokens CSS pour colorer les slots
 * (squat / hinge / horizontal push / etc.)
 */
import type { Exercise } from '@/types/database'

export type MovementCategory = Exercise['category']

export interface MovementTheme {
  /** Variable CSS de base (badge / pill) */
  base: string
  /** Variable CSS background card en dark */
  bg: string
  /** Variable CSS bordure */
  border: string
  /** Variable CSS texte */
  fg: string
  /** Variable CSS shadow / glow */
  shadow: string
  /** Libellé court FR */
  label: string
}

const TOKEN_BY_CATEGORY: Record<MovementCategory, { prefix: string; label: string }> = {
  Squat: { prefix: '--mvmt-squat', label: 'Squat' },
  Hinge: { prefix: '--mvmt-hinge', label: 'Hinge' },
  'Horizontal Push': { prefix: '--mvmt-hpush', label: 'H. Push' },
  'Horizontal Pull': { prefix: '--mvmt-hpull', label: 'H. Pull' },
  'Vertical Push': { prefix: '--mvmt-vpush', label: 'V. Push' },
  'Vertical Pull': { prefix: '--mvmt-vpull', label: 'V. Pull' },
  Accessoire: { prefix: '--mvmt-acc', label: 'Accessoire' },
  Cardio: { prefix: '--mvmt-cardio', label: 'Cardio' },
}

const ACCESSORY_FALLBACK: MovementTheme = {
  base: 'var(--mvmt-acc)',
  bg: 'var(--mvmt-acc-bg)',
  border: 'var(--mvmt-acc-border)',
  fg: 'var(--mvmt-acc-fg)',
  shadow: 'var(--mvmt-acc-shadow)',
  label: 'Accessoire',
}

export function themeForCategory(category: MovementCategory | null | undefined): MovementTheme {
  if (!category) return ACCESSORY_FALLBACK
  const def = TOKEN_BY_CATEGORY[category]
  if (!def) return ACCESSORY_FALLBACK
  return {
    base: `var(${def.prefix})`,
    bg: `var(${def.prefix}-bg)`,
    border: `var(${def.prefix}-border)`,
    fg: `var(${def.prefix}-fg)`,
    shadow: `var(${def.prefix}-shadow)`,
    label: def.label,
  }
}

/** Détection heuristique de catégorie depuis le nom (fallback quand pas d'exercice lié) */
export function guessCategory(name: string): MovementCategory {
  const n = name.toLowerCase()
  if (/squat|sq\b/.test(n)) return 'Squat'
  if (/deadlift|soulev|hinge|rdl|sdt|good morning/.test(n)) return 'Hinge'
  if (/bench|développé couché|push[- ]?up/.test(n)) return 'Horizontal Push'
  if (/row|tirage horiz/.test(n)) return 'Horizontal Pull'
  if (/ohp|overhead|développé militaire|shoulder press/.test(n)) return 'Vertical Push'
  if (/pull[- ]?up|chin[- ]?up|tractions|tirage vertical/.test(n)) return 'Vertical Pull'
  if (/cardio|run|bike|row(ing)?\b|érgo/.test(n)) return 'Cardio'
  return 'Accessoire'
}

/** Renvoie le thème pour un exercice (par catégorie ou par nom) */
export function themeForExercise(name: string, category?: MovementCategory | null): MovementTheme {
  return themeForCategory(category ?? guessCategory(name))
}
