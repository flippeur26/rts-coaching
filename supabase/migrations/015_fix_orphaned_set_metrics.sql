-- Migration 015: Fix orphaned set metrics when ACTUAL fields are cleared
-- ============================================================
-- Problem: When ACTUAL fields (weight_actual_kg, rpe_actual, reps_actual)
-- are set to NULL, the calculated metrics (e1rm_kg, central_stress, etc.)
-- were not being reset. This left orphaned values that would be included
-- in totals, even though they had no corresponding actual data.
--
-- Solution: Add ELSE clause to calculate_set_metrics() trigger to explicitly
-- reset calculated metrics to NULL when ACTUAL fields are incomplete.
-- ============================================================

create or replace function calculate_set_metrics()
returns trigger language plpgsql as $$
begin
  -- Calculs uniquement si weight_actual_kg et rpe_actual et reps_actual sont renseignés
  if new.weight_actual_kg is not null and new.rpe_actual is not null and new.reps_actual is not null then
    new.e1rm_kg := get_e1rm(new.weight_actual_kg, new.rpe_actual, new.reps_actual);
    new.central_stress := get_central_stress(new.rpe_actual, new.reps_actual);
    new.peripheral_stress := get_peripheral_stress(new.rpe_actual, new.reps_actual);
    new.total_stress := get_total_stress(new.rpe_actual, new.reps_actual);
  else
    -- Reset calculated metrics if ACTUAL fields are incomplete
    new.e1rm_kg := null;
    new.central_stress := null;
    new.peripheral_stress := null;
    new.total_stress := null;
  end if;

  -- rpe_realization_pct
  if new.rpe_prescribed is not null and new.rpe_actual is not null and new.rpe_actual != 0 then
    new.rpe_realization_pct := round((new.rpe_prescribed / new.rpe_actual) * 100, 2);
  else
    new.rpe_realization_pct := null;
  end if;

  return new;
end;
$$;

-- Trigger already exists from migration 003, no need to recreate
-- It will use the new function definition above
