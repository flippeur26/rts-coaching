-- ============================================================
-- Migration 012 : Paramètres athlète (système métrique + équipement)
-- ============================================================
-- 1:1 avec profiles. Permet à chaque athlète de configurer :
--   - système d'unités (kg vs lbs) — affichage uniquement, DB toujours en kg
--   - poids de la barre utilisée
--   - liste des disques disponibles dans sa salle (pour arrondi automatique
--     des charges recommandées par le WorkoutPlanner)
--   - poids des colliers
--
-- Le coach peut éditer les settings de ses athlètes liés (status='accepted').
-- ============================================================

create table if not exists athlete_settings (
  athlete_id uuid primary key references profiles(id) on delete cascade,
  unit_system text not null default 'metric' check (unit_system in ('metric', 'imperial')),
  bar_weight_kg decimal(5,2) not null default 20.0 check (bar_weight_kg > 0),
  collar_weight_kg decimal(5,2) not null default 0.0 check (collar_weight_kg >= 0),
  available_plates_kg decimal(5,3)[] not null default array[25, 20, 15, 10, 5, 2.5, 1.5, 1.25, 1, 0.5]::decimal(5,3)[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table athlete_settings enable row level security;

-- Athlète : lecture/écriture de ses propres settings
create policy "Athlete reads own settings" on athlete_settings
  for select using (auth.uid() = athlete_id);

create policy "Athlete updates own settings" on athlete_settings
  for update using (auth.uid() = athlete_id) with check (auth.uid() = athlete_id);

create policy "Athlete inserts own settings" on athlete_settings
  for insert with check (auth.uid() = athlete_id);

-- Coach : lecture/écriture des settings de ses athlètes liés (accepted)
create policy "Coach reads linked athlete settings" on athlete_settings
  for select using (
    exists (
      select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = athlete_settings.athlete_id
        and ca.status = 'accepted'
    )
  );

create policy "Coach updates linked athlete settings" on athlete_settings
  for update using (
    exists (
      select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = athlete_settings.athlete_id
        and ca.status = 'accepted'
    )
  ) with check (
    exists (
      select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = athlete_settings.athlete_id
        and ca.status = 'accepted'
    )
  );

create policy "Coach inserts linked athlete settings" on athlete_settings
  for insert with check (
    exists (
      select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = athlete_settings.athlete_id
        and ca.status = 'accepted'
    )
  );

-- updated_at auto
drop trigger if exists trg_athlete_settings_updated_at on athlete_settings;
create trigger trg_athlete_settings_updated_at
  before update on athlete_settings
  for each row execute function set_updated_at();


-- ============================================================
-- Trigger : créer settings par défaut à l'inscription d'un athlète
-- ============================================================
create or replace function create_default_athlete_settings()
returns trigger language plpgsql security definer
set search_path = public, auth
as $$
begin
  if new.role = 'athlete' then
    insert into athlete_settings (athlete_id)
    values (new.id)
    on conflict (athlete_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_create_athlete_settings on profiles;
create trigger trg_create_athlete_settings
  after insert on profiles
  for each row execute function create_default_athlete_settings();


-- Backfill : créer les settings pour les athlètes existants
insert into athlete_settings (athlete_id)
select id from profiles
where role = 'athlete'
on conflict (athlete_id) do nothing;
