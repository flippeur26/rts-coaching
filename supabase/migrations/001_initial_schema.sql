-- Migration 001 : Schéma initial RTS Coaching
-- Active l'extension uuid-ossp pour gen_random_uuid()
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (extension de auth.users)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('coach', 'athlete')),
  full_name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

-- RLS
alter table profiles enable row level security;

create policy "Lecture profil propre" on profiles
  for select using (auth.uid() = id);

create policy "MAJ profil propre" on profiles
  for update using (auth.uid() = id);

-- Trigger : créer le profil automatiquement à l'inscription
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'athlete')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ============================================================
-- COACH_ATHLETE (relation many-to-many)
-- ============================================================
create table coach_athlete (
  coach_id uuid not null references profiles(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, athlete_id)
);

alter table coach_athlete enable row level security;

create policy "Coach voit ses relations" on coach_athlete
  for select using (auth.uid() = coach_id);

create policy "Coach crée ses relations" on coach_athlete
  for insert with check (auth.uid() = coach_id);

create policy "Coach supprime ses relations" on coach_athlete
  for delete using (auth.uid() = coach_id);

create policy "Athlète voit ses coachs" on coach_athlete
  for select using (auth.uid() = athlete_id);


-- ============================================================
-- BLOCKS (mésocycles)
-- ============================================================
create table blocks (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  type text not null check (type in ('Accumulation', 'Intensification', 'Réalisation', 'Deload')),
  start_date date not null,
  end_date date,
  total_weeks int,
  intensity_zone text,
  weeks_to_competition int,
  is_taper boolean not null default false,
  taper_volume_reduction_pct decimal(5,2),
  created_at timestamptz not null default now()
);

alter table blocks enable row level security;

create policy "Coach voit blocs de ses athlètes" on blocks
  for select using (
    auth.uid() = coach_id
  );

create policy "Athlète voit ses blocs" on blocks
  for select using (auth.uid() = athlete_id);

create policy "Coach gère les blocs" on blocks
  for all using (auth.uid() = coach_id);

create index idx_blocks_athlete_id on blocks(athlete_id);
create index idx_blocks_coach_id on blocks(coach_id);


-- ============================================================
-- SESSIONS (séances prescrites)
-- ============================================================
create table sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid not null references profiles(id) on delete cascade,
  block_id uuid references blocks(id) on delete set null,
  scheduled_date date not null,
  week_in_block int,
  session_number int,
  notes_coach text,
  notes_athlete text,
  bodyweight_kg decimal(5,2),
  duration_min int,
  session_feel int check (session_feel between 1 and 5),
  status text not null default 'prescribed' check (status in ('prescribed', 'in_progress', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table sessions enable row level security;

create policy "Coach voit les séances de ses athlètes" on sessions
  for select using (auth.uid() = coach_id);

create policy "Athlète voit ses séances" on sessions
  for select using (auth.uid() = athlete_id);

create policy "Coach gère les séances" on sessions
  for all using (auth.uid() = coach_id);

create policy "Athlète MAJ ses séances" on sessions
  for update using (auth.uid() = athlete_id);

create index idx_sessions_athlete_date on sessions(athlete_id, scheduled_date desc);
create index idx_sessions_block_id on sessions(block_id);
create index idx_sessions_coach_id on sessions(coach_id);


-- ============================================================
-- SETS (cœur de l'application)
-- ============================================================
create table sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  exercise_name text not null,
  exercise_format text,
  set_number int not null,
  -- PRESCRIT
  weight_prescribed_kg decimal(6,2),
  reps_prescribed int,
  rpe_prescribed decimal(3,1),
  tempo text,
  -- RÉALISÉ
  weight_actual_kg decimal(6,2),
  reps_actual int,
  rpe_actual decimal(3,1),
  -- CALCULÉS (jamais saisis manuellement)
  volume_load_kg decimal(10,2) generated always as (
    case when weight_actual_kg is not null and reps_actual is not null
    then weight_actual_kg * reps_actual
    else null end
  ) stored,
  e1rm_kg decimal(7,2),
  central_stress decimal(5,2),
  peripheral_stress decimal(5,2),
  total_stress decimal(5,2),
  rpe_realization_pct decimal(6,2),
  created_at timestamptz not null default now()
);

alter table sets enable row level security;

create policy "Coach voit les sets via sessions" on sets
  for select using (
    exists (
      select 1 from sessions s
      where s.id = sets.session_id and s.coach_id = auth.uid()
    )
  );

create policy "Athlète voit ses sets" on sets
  for select using (
    exists (
      select 1 from sessions s
      where s.id = sets.session_id and s.athlete_id = auth.uid()
    )
  );

create policy "Coach gère les sets" on sets
  for all using (
    exists (
      select 1 from sessions s
      where s.id = sets.session_id and s.coach_id = auth.uid()
    )
  );

create policy "Athlète MAJ ses sets réalisés" on sets
  for update using (
    exists (
      select 1 from sessions s
      where s.id = sets.session_id and s.athlete_id = auth.uid()
    )
  );

create index idx_sets_session_id on sets(session_id);


-- ============================================================
-- DAILY_TRACKERS (traceurs quotidiens)
-- ============================================================
create table daily_trackers (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  general_fatigue int check (general_fatigue between 1 and 5),
  squat_fatigue int check (squat_fatigue between 1 and 5),
  bench_fatigue int check (bench_fatigue between 1 and 5),
  deadlift_fatigue int check (deadlift_fatigue between 1 and 5),
  motivation int check (motivation between 1 and 5),
  recovery int check (recovery between 1 and 5),
  sleep_duration_min int,
  sleep_quality int check (sleep_quality between 1 and 10),
  bodyweight_kg decimal(5,2),
  notes text,
  created_at timestamptz not null default now(),
  unique (athlete_id, date)
);

alter table daily_trackers enable row level security;

create policy "Athlète gère ses traceurs" on daily_trackers
  for all using (auth.uid() = athlete_id);

create policy "Coach voit les traceurs de ses athlètes" on daily_trackers
  for select using (
    exists (
      select 1 from coach_athlete ca
      where ca.coach_id = auth.uid() and ca.athlete_id = daily_trackers.athlete_id
    )
  );

create index idx_daily_trackers_athlete_date on daily_trackers(athlete_id, date desc);


-- ============================================================
-- COMPETITIONS
-- ============================================================
create table competitions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid not null references profiles(id) on delete cascade,
  competition_date date not null,
  name text not null,
  -- Planification tentatives
  squat_attempt_1 decimal(6,2), squat_attempt_2 decimal(6,2), squat_attempt_3 decimal(6,2),
  bench_attempt_1 decimal(6,2), bench_attempt_2 decimal(6,2), bench_attempt_3 decimal(6,2),
  deadlift_attempt_1 decimal(6,2), deadlift_attempt_2 decimal(6,2), deadlift_attempt_3 decimal(6,2),
  projected_total decimal(7,2),
  -- Résultats
  squat_result_1 boolean, squat_result_2 boolean, squat_result_3 boolean,
  squat_best_kg decimal(6,2),
  bench_result_1 boolean, bench_result_2 boolean, bench_result_3 boolean,
  bench_best_kg decimal(6,2),
  deadlift_result_1 boolean, deadlift_result_2 boolean, deadlift_result_3 boolean,
  deadlift_best_kg decimal(6,2),
  total_kg decimal(7,2),
  ipf_gl_points decimal(7,3),
  -- Bilan
  post_comp_notes text,
  weakest_lift text,
  next_block_goals text,
  created_at timestamptz not null default now()
);

alter table competitions enable row level security;

create policy "Coach voit les compétitions de ses athlètes" on competitions
  for select using (auth.uid() = coach_id);

create policy "Athlète voit ses compétitions" on competitions
  for select using (auth.uid() = athlete_id);

create policy "Coach gère les compétitions" on competitions
  for all using (auth.uid() = coach_id);

create policy "Athlète MAJ ses résultats" on competitions
  for update using (auth.uid() = athlete_id);

create index idx_competitions_athlete_date on competitions(athlete_id, competition_date desc);
