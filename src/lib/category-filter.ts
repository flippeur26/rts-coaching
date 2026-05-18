/**
 * Mapping filtre UI ↔ catégories de mouvement.
 *
 * Utilisé client (CategoryFilterStrip, WeekDailyCharts) ET serveur (bounds engine)
 * pour garantir cohérence des regroupements.
 */
import type { MovementCategory } from './movement'

export const CATEGORY_FILTER_MAP: Record<CategoryFilter, MovementCategory[]> = {
  Tous:  ['Squat', 'Hinge', 'Horizontal Push', 'Vertical Push', 'Horizontal Pull', 'Vertical Pull', 'Accessoire', 'Cardio'],
  Push:  ['Horizontal Push', 'Vertical Push'],
  Hinge: ['Hinge'],
  Squat: ['Squat'],
  Reste: ['Horizontal Pull', 'Vertical Pull', 'Accessoire', 'Cardio'],
}

export type CategoryFilter = 'Tous' | 'Push' | 'Hinge' | 'Squat' | 'Reste'

export const CATEGORY_FILTERS: CategoryFilter[] = ['Tous', 'Push', 'Hinge', 'Squat', 'Reste']

export const CATEGORY_FILTER_LABELS: Record<CategoryFilter, string> = {
  Tous: 'Tous',
  Push: 'Push (V+H)',
  Hinge: 'Hinge',
  Squat: 'Squat',
  Reste: 'Reste',
}
