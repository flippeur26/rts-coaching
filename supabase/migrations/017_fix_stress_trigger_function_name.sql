-- Migration 017: Fix trigger function name mismatch
-- ============================================================
-- Problem: Migration 016 created function `trg_calculate_set_metrics()` with
-- the new prescribed/actual logic, but the trigger (from migration 003) calls
-- `calculate_set_metrics()`. Result: prescribed stress/impulse columns are
-- never recomputed on INSERT/UPDATE, so editing a prescribed weight/reps/rpe
-- leaves stale values.
--
-- Solution: Redefine `calculate_set_metrics()` (the function actually wired
-- to the trigger) with the full prescribed + actual logic.
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_set_metrics()
RETURNS TRIGGER AS $$
DECLARE
  v_e1rm_prescribed numeric;
BEGIN
  -- Calcul PRESCRIT (stress + impulse)
  IF new.weight_prescribed_kg IS NOT NULL AND new.rpe_prescribed IS NOT NULL AND new.reps_prescribed IS NOT NULL THEN
    new.central_stress_prescribed := get_central_stress(new.rpe_prescribed, new.reps_prescribed);
    new.peripheral_stress_prescribed := get_peripheral_stress(new.rpe_prescribed, new.reps_prescribed);
    new.total_stress_prescribed := get_total_stress(new.rpe_prescribed, new.reps_prescribed);

    v_e1rm_prescribed := get_e1rm(new.weight_prescribed_kg, new.rpe_prescribed, new.reps_prescribed);
    IF v_e1rm_prescribed IS NOT NULL AND v_e1rm_prescribed > 0 THEN
      new.impulse_prescribed := new.weight_prescribed_kg * (new.weight_prescribed_kg / v_e1rm_prescribed) * new.reps_prescribed;
    ELSE
      new.impulse_prescribed := NULL;
    END IF;
  ELSE
    new.central_stress_prescribed := NULL;
    new.peripheral_stress_prescribed := NULL;
    new.total_stress_prescribed := NULL;
    new.impulse_prescribed := NULL;
  END IF;

  -- Calcul RÉALISÉ (stress + impulse + e1rm)
  IF new.weight_actual_kg IS NOT NULL AND new.rpe_actual IS NOT NULL AND new.reps_actual IS NOT NULL THEN
    new.e1rm_kg := get_e1rm(new.weight_actual_kg, new.rpe_actual, new.reps_actual);
    new.central_stress := get_central_stress(new.rpe_actual, new.reps_actual);
    new.peripheral_stress := get_peripheral_stress(new.rpe_actual, new.reps_actual);
    new.total_stress := get_total_stress(new.rpe_actual, new.reps_actual);

    IF new.e1rm_kg IS NOT NULL AND new.e1rm_kg > 0 THEN
      new.impulse_actual := new.weight_actual_kg * (new.weight_actual_kg / new.e1rm_kg) * new.reps_actual;
    ELSE
      new.impulse_actual := NULL;
    END IF;
  ELSE
    new.e1rm_kg := NULL;
    new.central_stress := NULL;
    new.peripheral_stress := NULL;
    new.total_stress := NULL;
    new.impulse_actual := NULL;
  END IF;

  -- rpe_realization_pct
  IF new.rpe_prescribed IS NOT NULL AND new.rpe_actual IS NOT NULL AND new.rpe_actual != 0 THEN
    new.rpe_realization_pct := round((new.rpe_prescribed / new.rpe_actual) * 100, 2);
  ELSE
    new.rpe_realization_pct := NULL;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Backfill : recalcule prescribed pour tous les sets existants en touchant chaque ligne
-- (le trigger BEFORE UPDATE va se déclencher et remplir les colonnes)
UPDATE sets SET set_number = set_number;
