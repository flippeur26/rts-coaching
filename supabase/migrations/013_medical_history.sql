-- ============================================================
-- Migration 013 : Antécédents médicaux + blessures athlète
-- ============================================================
-- Deux tables :
--   - athlete_medical_history : 1:1 profiles, antécédents généraux + notes
--   - athlete_injuries : 1:N, liste de blessures avec zone, sévérité, dates
--
-- Accès : athlète sur lui-même + coach lié (status='accepted').
-- ============================================================


-- ============================================================
-- ATHLETE_MEDICAL_HISTORY
-- ============================================================
create table if not exists athlete_medical_history (
  athlete_id uuid primary key references profiles(id) on delete cascade,
  general_history text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table athlete_medical_history enable row level security;

create policy "Athlete reads own medical" on athlete_medical_history
  for select using (auth.uid() = athlete_id);
create policy "Athlete inserts own medical" on athlete_medical_history
  for insert with check (auth.uid() = athlete_id);
create policy "Athlete updates own medical" on athlete_medical_history
  for update using (auth.uid() = athlete_id) with check (auth.uid() = athlete_id);

create policy "Coach reads linked medical" on athlete_medical_history
  for select using (
    exists (select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = athlete_medical_history.athlete_id
        and ca.status = 'accepted')
  );
create policy "Coach inserts linked medical" on athlete_medical_history
  for insert with check (
    exists (select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = athlete_medical_history.athlete_id
        and ca.status = 'accepted')
  );
create policy "Coach updates linked medical" on athlete_medical_history
  for update using (
    exists (select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = athlete_medical_history.athlete_id
        and ca.status = 'accepted')
  ) with check (
    exists (select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = athlete_medical_history.athlete_id
        and ca.status = 'accepted')
  );

drop trigger if exists trg_medical_history_updated_at on athlete_medical_history;
create trigger trg_medical_history_updated_at
  before update on athlete_medical_history
  for each row execute function set_updated_at();


-- ============================================================
-- ATHLETE_INJURIES
-- ============================================================
create table if not exists athlete_injuries (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references profiles(id) on delete cascade,
  body_zone text not null check (body_zone in (
    'Cervicales','Épaule','Coude','Poignet','Lombaires',
    'Hanche','Genou','Cheville','Pied','Tronc','Jambe','Bras'
  )),
  description text,
  severity int check (severity between 1 and 5),
  status text not null default 'active' check (status in ('active','resolved')),
  started_on date,
  resolved_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (resolved_on is null or started_on is null or resolved_on >= started_on),
  check (status = 'active' or resolved_on is not null)
);

alter table athlete_injuries enable row level security;

create policy "Athlete reads own injuries" on athlete_injuries
  for select using (auth.uid() = athlete_id);
create policy "Athlete inserts own injuries" on athlete_injuries
  for insert with check (auth.uid() = athlete_id);
create policy "Athlete updates own injuries" on athlete_injuries
  for update using (auth.uid() = athlete_id) with check (auth.uid() = athlete_id);
create policy "Athlete deletes own injuries" on athlete_injuries
  for delete using (auth.uid() = athlete_id);

create policy "Coach reads linked injuries" on athlete_injuries
  for select using (
    exists (select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = athlete_injuries.athlete_id
        and ca.status = 'accepted')
  );
create policy "Coach inserts linked injuries" on athlete_injuries
  for insert with check (
    exists (select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = athlete_injuries.athlete_id
        and ca.status = 'accepted')
  );
create policy "Coach updates linked injuries" on athlete_injuries
  for update using (
    exists (select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = athlete_injuries.athlete_id
        and ca.status = 'accepted')
  ) with check (
    exists (select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = athlete_injuries.athlete_id
        and ca.status = 'accepted')
  );
create policy "Coach deletes linked injuries" on athlete_injuries
  for delete using (
    exists (select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = athlete_injuries.athlete_id
        and ca.status = 'accepted')
  );

drop trigger if exists trg_injuries_updated_at on athlete_injuries;
create trigger trg_injuries_updated_at
  before update on athlete_injuries
  for each row execute function set_updated_at();

create index if not exists idx_injuries_athlete_status
  on athlete_injuries(athlete_id, status);
