-- ============================================================
-- Migration 009 : Durcissement sécurité + corrections schéma
-- ============================================================
-- Couvre les problèmes identifiés lors de la revue de schéma + sécurité :
--   1. Empêche l'escalade de privilèges à l'inscription
--   2. Empêche le changement de role par l'utilisateur
--   3. WITH CHECK sur policies UPDATE (sets / sessions / competitions / trackers)
--   4. Trigger : athlète ne peut pas modifier les champs prescrits
--   5. CHECK bornes métier (weight > 0, rpe ∈ [5,10], reps > 0, etc.)
--   6. CHECK no_self_coach + dates ordonnées sur blocks
--   7. Fix UNIQUE exercises avec NULL coach_id
--   8. Aligne rpe_realization_pct sur CLAUDE.md (actual / prescribed × 100)
--   9. Ajoute updated_at + triggers sur les tables métier
--  10. Index manquants
--
-- Idempotente — peut être rejouée sans erreur.
-- ============================================================


-- ============================================================
-- 1. EMPÊCHE L'ESCALADE DE PRIVILÈGES À L'INSCRIPTION
-- ============================================================
-- AVANT : `coalesce(new.raw_user_meta_data->>'role', 'athlete')` permettait
-- à n'importe qui de s'inscrire comme coach via le form (option.data.role).
-- APRÈS : tout nouveau compte est créé en 'athlete'. La promotion en coach
-- se fait via service_role (Supabase SQL editor) — voir snippet en bas.

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'athlete'  -- forcé : pas d'auto-promotion en coach via signup
  );
  return new;
end;
$$;


-- ============================================================
-- 2. EMPÊCHE LE CHANGEMENT DE ROLE PAR L'UTILISATEUR
-- ============================================================
-- L'ancienne policy "MAJ profil propre" autorisait UPDATE sur toutes les
-- colonnes — y compris `role`. Un user pouvait donc faire :
--   update profiles set role='coach' where id = auth.uid();
-- Le trigger ci-dessous bloque tout changement de role sauf si l'appel
-- vient de service_role (auth.uid() = NULL dans ce cas).

create or replace function prevent_role_change()
returns trigger language plpgsql security definer as $$
begin
  if old.role is distinct from new.role then
    -- auth.uid() est NULL pour service_role / postgres direct → autorisé
    -- Pour un user authentifié → bloqué.
    if auth.uid() is not null then
      raise exception 'Le rôle ne peut pas être modifié par l''utilisateur. Contactez un admin.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_change on profiles;
create trigger trg_prevent_role_change
  before update of role on profiles
  for each row execute function prevent_role_change();

-- Re-création de la policy avec WITH CHECK explicite (defense in depth)
drop policy if exists "MAJ profil propre" on profiles;
create policy "MAJ profil propre" on profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);


-- ============================================================
-- 3. WITH CHECK sur les policies UPDATE
-- ============================================================
-- Empêche un user de réaffecter une ligne à quelqu'un d'autre via UPDATE.
-- (USING contrôle l'accès à la ligne d'origine ; WITH CHECK contrôle
--  l'état après mutation.)

-- SETS : athlète
drop policy if exists "Athlète MAJ ses sets réalisés" on sets;
create policy "Athlète MAJ ses sets réalisés" on sets
  for update
  using (
    exists (
      select 1 from sessions s
      where s.id = sets.session_id and s.athlete_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sessions s
      where s.id = sets.session_id and s.athlete_id = auth.uid()
    )
  );

-- SESSIONS : athlète
drop policy if exists "Athlète MAJ ses séances" on sessions;
create policy "Athlète MAJ ses séances" on sessions
  for update
  using (auth.uid() = athlete_id)
  with check (auth.uid() = athlete_id);

-- COMPETITIONS : athlète
drop policy if exists "Athlète MAJ ses résultats" on competitions;
create policy "Athlète MAJ ses résultats" on competitions
  for update
  using (auth.uid() = athlete_id)
  with check (auth.uid() = athlete_id);

-- DAILY_TRACKERS : coach (la policy était déjà en place via 005, on ajoute WITH CHECK)
drop policy if exists "Coach met à jour traceurs de ses athlètes" on daily_trackers;
create policy "Coach met à jour traceurs de ses athlètes" on daily_trackers
  for update
  using (
    exists (
      select 1 from coach_athlete ca
      where ca.coach_id = auth.uid() and ca.athlete_id = daily_trackers.athlete_id
    )
  )
  with check (
    exists (
      select 1 from coach_athlete ca
      where ca.coach_id = auth.uid() and ca.athlete_id = daily_trackers.athlete_id
    )
  );


-- ============================================================
-- 4. TRIGGER : ATHLÈTE NE PEUT PAS MODIFIER LES CHAMPS PRESCRITS
-- ============================================================
-- L'API enforce déjà via updateSetAthleteSchema, mais ça peut être
-- contourné en appelant Supabase directement avec le JWT athlète.
-- On reset les champs prescrits aux anciennes valeurs si l'utilisateur
-- est athlète. (Coach et service_role passent au travers.)

create or replace function prevent_athlete_modifying_prescription()
returns trigger language plpgsql security definer as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    -- Appel admin (service_role) — passe sans contrôle
    return new;
  end if;

  select role into v_role from profiles where id = auth.uid();

  if v_role = 'athlete' then
    new.exercise_name := old.exercise_name;
    new.exercise_format := old.exercise_format;
    new.set_number := old.set_number;
    new.weight_prescribed_kg := old.weight_prescribed_kg;
    new.reps_prescribed := old.reps_prescribed;
    new.rpe_prescribed := old.rpe_prescribed;
    new.tempo := old.tempo;
    new.rom_prescribed := old.rom_prescribed;
    new.session_id := old.session_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_athlete_prescription on sets;
create trigger trg_prevent_athlete_prescription
  before update on sets
  for each row execute function prevent_athlete_modifying_prescription();


-- ============================================================
-- 5. CHECK BORNES MÉTIER
-- ============================================================
-- Garde-fous côté DB pour empêcher les valeurs absurdes (négatives, hors RPE).

-- SETS
alter table sets drop constraint if exists sets_weight_prescribed_pos;
alter table sets add constraint sets_weight_prescribed_pos
  check (weight_prescribed_kg is null or weight_prescribed_kg > 0);

alter table sets drop constraint if exists sets_weight_actual_pos;
alter table sets add constraint sets_weight_actual_pos
  check (weight_actual_kg is null or weight_actual_kg > 0);

alter table sets drop constraint if exists sets_reps_prescribed_pos;
alter table sets add constraint sets_reps_prescribed_pos
  check (reps_prescribed is null or reps_prescribed > 0);

alter table sets drop constraint if exists sets_reps_actual_pos;
alter table sets add constraint sets_reps_actual_pos
  check (reps_actual is null or reps_actual > 0);

alter table sets drop constraint if exists sets_rpe_prescribed_range;
alter table sets add constraint sets_rpe_prescribed_range
  check (rpe_prescribed is null or rpe_prescribed between 5 and 10);

alter table sets drop constraint if exists sets_rpe_actual_range;
alter table sets add constraint sets_rpe_actual_range
  check (rpe_actual is null or rpe_actual between 5 and 10);

alter table sets drop constraint if exists sets_set_number_pos;
alter table sets add constraint sets_set_number_pos
  check (set_number > 0);

-- SESSIONS
alter table sessions drop constraint if exists sessions_duration_pos;
alter table sessions add constraint sessions_duration_pos
  check (duration_min is null or duration_min > 0);

alter table sessions drop constraint if exists sessions_bodyweight_pos;
alter table sessions add constraint sessions_bodyweight_pos
  check (bodyweight_kg is null or bodyweight_kg > 0);

-- DAILY_TRACKERS
alter table daily_trackers drop constraint if exists trackers_bodyweight_pos;
alter table daily_trackers add constraint trackers_bodyweight_pos
  check (bodyweight_kg is null or bodyweight_kg > 0);

alter table daily_trackers drop constraint if exists trackers_sleep_duration_range;
alter table daily_trackers add constraint trackers_sleep_duration_range
  check (sleep_duration_min is null or sleep_duration_min between 0 and 1440);

-- COMPETITIONS : essais > 0 si renseignés
alter table competitions drop constraint if exists comp_attempts_pos;
alter table competitions add constraint comp_attempts_pos check (
  (squat_attempt_1    is null or squat_attempt_1    > 0) and
  (squat_attempt_2    is null or squat_attempt_2    > 0) and
  (squat_attempt_3    is null or squat_attempt_3    > 0) and
  (bench_attempt_1    is null or bench_attempt_1    > 0) and
  (bench_attempt_2    is null or bench_attempt_2    > 0) and
  (bench_attempt_3    is null or bench_attempt_3    > 0) and
  (deadlift_attempt_1 is null or deadlift_attempt_1 > 0) and
  (deadlift_attempt_2 is null or deadlift_attempt_2 > 0) and
  (deadlift_attempt_3 is null or deadlift_attempt_3 > 0)
);


-- ============================================================
-- 6. NO_SELF_COACH + DATES ORDONNÉES
-- ============================================================
alter table coach_athlete drop constraint if exists no_self_coach;
alter table coach_athlete add constraint no_self_coach
  check (coach_id <> athlete_id);

alter table blocks drop constraint if exists blocks_dates_ordered;
alter table blocks add constraint blocks_dates_ordered
  check (end_date is null or end_date >= start_date);

alter table blocks drop constraint if exists blocks_total_weeks_pos;
alter table blocks add constraint blocks_total_weeks_pos
  check (total_weeks is null or total_weeks > 0);


-- ============================================================
-- 7. FIX UNIQUE EXERCISES (NULL coach_id)
-- ============================================================
-- L'ancienne contrainte UNIQUE(name, coach_id) ne marche pas pour les exos
-- système (coach_id IS NULL) car NULL ≠ NULL en SQL standard.
-- → Remplacée par deux index uniques partiels.

alter table exercises drop constraint if exists exercises_name_coach_id_key;

drop index if exists exercises_name_coach_unique;
create unique index exercises_name_coach_unique
  on exercises (name, coach_id) where coach_id is not null;

drop index if exists exercises_name_system_unique;
create unique index exercises_name_system_unique
  on exercises (name) where coach_id is null;


-- ============================================================
-- 8. ALIGNE rpe_realization_pct SUR CLAUDE.md
-- ============================================================
-- CLAUDE.md : (rpe_actual / rpe_prescribed) × 100
-- Convention : 100% = pile sur la cible, >100% = athlète a surforcé,
-- <100% = athlète plus frais que prévu (a tenu un RPE plus bas).
-- Le calcul actuel inversait la formule.

create or replace function calculate_set_metrics()
returns trigger language plpgsql as $$
begin
  if new.weight_actual_kg is not null
     and new.rpe_actual is not null
     and new.reps_actual is not null then
    new.e1rm_kg          := get_e1rm(new.weight_actual_kg, new.rpe_actual, new.reps_actual);
    new.central_stress    := get_central_stress(new.rpe_actual, new.reps_actual);
    new.peripheral_stress := get_peripheral_stress(new.rpe_actual, new.reps_actual);
    new.total_stress      := get_total_stress(new.rpe_actual, new.reps_actual);
  end if;

  if new.rpe_prescribed is not null
     and new.rpe_actual is not null
     and new.rpe_prescribed <> 0 then
    new.rpe_realization_pct := round((new.rpe_actual / new.rpe_prescribed) * 100, 2);
  end if;

  return new;
end;
$$;


-- ============================================================
-- 9. updated_at + TRIGGERS
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter table profiles        add column if not exists updated_at timestamptz not null default now();
alter table blocks          add column if not exists updated_at timestamptz not null default now();
alter table sessions        add column if not exists updated_at timestamptz not null default now();
alter table sets            add column if not exists updated_at timestamptz not null default now();
alter table daily_trackers  add column if not exists updated_at timestamptz not null default now();
alter table competitions    add column if not exists updated_at timestamptz not null default now();
alter table exercises       add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

drop trigger if exists trg_blocks_updated_at on blocks;
create trigger trg_blocks_updated_at before update on blocks
  for each row execute function set_updated_at();

drop trigger if exists trg_sessions_updated_at on sessions;
create trigger trg_sessions_updated_at before update on sessions
  for each row execute function set_updated_at();

drop trigger if exists trg_sets_updated_at on sets;
create trigger trg_sets_updated_at before update on sets
  for each row execute function set_updated_at();

drop trigger if exists trg_trackers_updated_at on daily_trackers;
create trigger trg_trackers_updated_at before update on daily_trackers
  for each row execute function set_updated_at();

drop trigger if exists trg_competitions_updated_at on competitions;
create trigger trg_competitions_updated_at before update on competitions
  for each row execute function set_updated_at();

drop trigger if exists trg_exercises_updated_at on exercises;
create trigger trg_exercises_updated_at before update on exercises
  for each row execute function set_updated_at();


-- ============================================================
-- 10. INDEX MANQUANTS
-- ============================================================
-- Lookup inverse coach_athlete (athlète → ses coachs)
create index if not exists idx_coach_athlete_athlete on coach_athlete(athlete_id);

-- competitions(coach_id) — utilisé par RLS coach
create index if not exists idx_competitions_coach on competitions(coach_id);

-- sets(exercise_name) — historique e1RM par exercice
create index if not exists idx_sets_exercise_name on sets(exercise_name);

-- exercises(category) — filtre WorkoutPlanner par catégorie
create index if not exists idx_exercises_category on exercises(category);


-- ============================================================
-- HOW-TO : Promouvoir un user existant en coach
-- ============================================================
-- À exécuter via Supabase SQL editor (qui utilise service_role).
-- auth.uid() est NULL dans ce contexte → le trigger autorise le changement.
--
--   update profiles set role = 'coach' where email = 'coach@example.com';
--
-- ============================================================
