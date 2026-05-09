-- Migration 016: Separate prescribed vs actual stress + impulse calculation
-- Adds columns for prescribed stress/impulse (intent) and actual stress/impulse (outcome)
-- Impulse = weight × (weight/e1rm) × reps

-- Add prescribed stress columns
ALTER TABLE sets ADD COLUMN IF NOT EXISTS central_stress_prescribed numeric DEFAULT NULL;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS peripheral_stress_prescribed numeric DEFAULT NULL;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS total_stress_prescribed numeric DEFAULT NULL;

-- Add impulse columns (prescribed + actual)
ALTER TABLE sets ADD COLUMN IF NOT EXISTS impulse_prescribed numeric DEFAULT NULL;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS impulse_actual numeric DEFAULT NULL;

-- Create indexes for queries
CREATE INDEX IF NOT EXISTS idx_sets_central_stress_prescribed ON sets(central_stress_prescribed);
CREATE INDEX IF NOT EXISTS idx_sets_impulse_prescribed ON sets(impulse_prescribed);
CREATE INDEX IF NOT EXISTS idx_sets_impulse_actual ON sets(impulse_actual);

-- Update trigger to calculate both prescribed and actual stress + impulse
CREATE OR REPLACE FUNCTION trg_calculate_set_metrics()
RETURNS TRIGGER AS $$
DECLARE
  v_e1rm_prescribed numeric;
  v_e1rm_actual numeric;
BEGIN
  -- Calculate PRESCRIBED stress + impulse (intent, always when prescribed triplet complete)
  IF new.weight_prescribed_kg IS NOT NULL AND new.rpe_prescribed IS NOT NULL AND new.reps_prescribed IS NOT NULL THEN
    new.central_stress_prescribed := get_central_stress(new.rpe_prescribed, new.reps_prescribed);
    new.peripheral_stress_prescribed := get_peripheral_stress(new.rpe_prescribed, new.reps_prescribed);
    new.total_stress_prescribed := get_total_stress(new.rpe_prescribed, new.reps_prescribed);

    -- Impulse = weight × (weight/e1rm) × reps
    v_e1rm_prescribed := get_e1rm(new.weight_prescribed_kg, new.rpe_prescribed, new.reps_prescribed);
    IF v_e1rm_prescribed IS NOT NULL AND v_e1rm_prescribed > 0 THEN
      new.impulse_prescribed := new.weight_prescribed_kg * (new.weight_prescribed_kg / v_e1rm_prescribed) * new.reps_prescribed;
    END IF;
  END IF;

  -- Calculate ACTUAL stress + impulse (outcome, only when full actual triplet exists)
  IF new.weight_actual_kg IS NOT NULL AND new.rpe_actual IS NOT NULL AND new.reps_actual IS NOT NULL THEN
    new.e1rm_kg := get_e1rm(new.weight_actual_kg, new.rpe_actual, new.reps_actual);
    new.central_stress := get_central_stress(new.rpe_actual, new.reps_actual);
    new.peripheral_stress := get_peripheral_stress(new.rpe_actual, new.reps_actual);
    new.total_stress := get_total_stress(new.rpe_actual, new.reps_actual);

    -- Impulse = weight × (weight/e1rm) × reps
    IF new.e1rm_kg IS NOT NULL AND new.e1rm_kg > 0 THEN
      new.impulse_actual := new.weight_actual_kg * (new.weight_actual_kg / new.e1rm_kg) * new.reps_actual;
    END IF;

    new.rpe_realization_pct := CASE
      WHEN new.rpe_prescribed IS NOT NULL AND new.rpe_prescribed > 0
      THEN (new.rpe_actual / new.rpe_prescribed) * 100
      ELSE NULL
    END;
  ELSE
    -- Clear actual stress + impulse if triplet is incomplete
    IF new.weight_actual_kg IS NULL OR new.rpe_actual IS NULL OR new.reps_actual IS NULL THEN
      new.e1rm_kg := NULL;
      new.central_stress := NULL;
      new.peripheral_stress := NULL;
      new.total_stress := NULL;
      new.impulse_actual := NULL;
      new.rpe_realization_pct := NULL;
    END IF;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Backfill prescribed stress + impulse for existing sets
UPDATE sets
SET
  central_stress_prescribed = get_central_stress(rpe_prescribed, reps_prescribed),
  peripheral_stress_prescribed = get_peripheral_stress(rpe_prescribed, reps_prescribed),
  total_stress_prescribed = get_total_stress(rpe_prescribed, reps_prescribed),
  impulse_prescribed = CASE
    WHEN weight_prescribed_kg IS NOT NULL AND rpe_prescribed IS NOT NULL AND reps_prescribed IS NOT NULL
    THEN weight_prescribed_kg * (weight_prescribed_kg / get_e1rm(weight_prescribed_kg, rpe_prescribed, reps_prescribed)) * reps_prescribed
    ELSE NULL
  END
WHERE rpe_prescribed IS NOT NULL AND reps_prescribed IS NOT NULL AND weight_prescribed_kg IS NOT NULL;
