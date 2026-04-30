-- Migration 003 : Fonctions de calcul automatique des métriques RTS

-- ============================================================
-- FONCTION : Lookup e1RM avec interpolation
-- ============================================================
create or replace function get_e1rm(
  p_weight decimal,
  p_rpe decimal,
  p_reps int
) returns decimal language plpgsql stable as $$
declare
  v_pct decimal;
begin
  -- Clamp RPE entre 5 et 10, reps entre 1 et 12
  p_rpe := greatest(5.0, least(10.0, p_rpe));
  p_reps := greatest(1, least(12, p_reps));

  select pct into v_pct
  from lookup_e1rm
  where rpe = p_rpe and reps = p_reps;

  if v_pct is null or v_pct = 0 then
    return null;
  end if;

  return round(p_weight / v_pct, 2);
end;
$$;

-- ============================================================
-- FONCTION : Lookup Central Stress
-- ============================================================
create or replace function get_central_stress(
  p_rpe decimal,
  p_reps int
) returns decimal language plpgsql stable as $$
declare
  v_value decimal;
begin
  p_rpe := greatest(5.0, least(10.0, p_rpe));
  p_reps := greatest(1, least(15, p_reps));

  select value into v_value
  from lookup_central_stress
  where rpe = p_rpe and reps = p_reps;

  return v_value;
end;
$$;

-- ============================================================
-- FONCTION : Lookup Peripheral Stress
-- ============================================================
create or replace function get_peripheral_stress(
  p_rpe decimal,
  p_reps int
) returns decimal language plpgsql stable as $$
declare
  v_value decimal;
begin
  p_rpe := greatest(5.0, least(10.0, p_rpe));
  p_reps := greatest(1, least(15, p_reps));

  select value into v_value
  from lookup_peripheral_stress
  where rpe = p_rpe and reps = p_reps;

  return v_value;
end;
$$;

-- ============================================================
-- FONCTION : Lookup Total Stress
-- ============================================================
create or replace function get_total_stress(
  p_rpe decimal,
  p_reps int
) returns decimal language plpgsql stable as $$
declare
  v_value decimal;
begin
  p_rpe := greatest(5.0, least(10.0, p_rpe));
  p_reps := greatest(1, least(15, p_reps));

  select value into v_value
  from lookup_total_stress
  where rpe = p_rpe and reps = p_reps;

  return v_value;
end;
$$;

-- ============================================================
-- TRIGGER : Calcul automatique e1RM, stress, rpe_realization
-- Se déclenche à chaque INSERT ou UPDATE sur sets
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
  end if;

  -- rpe_realization_pct
  if new.rpe_prescribed is not null and new.rpe_actual is not null and new.rpe_actual != 0 then
    new.rpe_realization_pct := round((new.rpe_prescribed / new.rpe_actual) * 100, 2);
  end if;

  return new;
end;
$$;

create trigger trg_calculate_set_metrics
  before insert or update on sets
  for each row execute function calculate_set_metrics();
