-- 011_block_display_config.sql
-- Ajoute la configuration d'affichage des métriques par bloc.
-- Toutes les colonnes sont visibles par défaut.

ALTER TABLE blocks
ADD COLUMN IF NOT EXISTS display_config JSONB NOT NULL DEFAULT '{
  "show_tonnage": true,
  "show_impulse": true,
  "show_cs": true,
  "show_ps": true,
  "show_ts": true,
  "show_ratio_ac": true,
  "show_mean_rpe": true,
  "show_sets_by_category": true,
  "show_nl": true,
  "show_prescribed": true,
  "show_actual": true,
  "prescribed_only_if_not_started": false
}';
