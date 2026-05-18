-- 019_rename_display_config_keys.sql
-- Renomme les clés display_config pour les métriques uniquement
-- show_prescribed → show_metrics_prescribed
-- show_actual → show_metrics_actual

UPDATE blocks
SET display_config = jsonb_set(
  jsonb_set(
    display_config - 'show_prescribed' - 'show_actual',
    '{show_metrics_prescribed}',
    display_config -> 'show_prescribed'
  ),
  '{show_metrics_actual}',
  display_config -> 'show_actual'
)
WHERE display_config ? 'show_prescribed' OR display_config ? 'show_actual';

-- Update DEFAULT pour les nouveaux blocs
ALTER TABLE blocks
ALTER COLUMN display_config SET DEFAULT '{
  "show_tonnage": true,
  "show_impulse": true,
  "show_cs": true,
  "show_ps": true,
  "show_ts": true,
  "show_ratio_ac": true,
  "show_mean_rpe": true,
  "show_sets_by_category": true,
  "show_nl": true,
  "show_metrics_prescribed": true,
  "show_metrics_actual": true,
  "prescribed_only_if_not_started": false
}'::jsonb;
