-- ============================================================
-- Migration 011 : Templates de blocs et de séances
-- ============================================================
-- Permet au coach de sauvegarder un bloc / une séance comme template
-- réutilisable, et de l'instancier sur n'importe quel athlète/date.
--
-- block_templates       : métadonnées de bloc réutilisables (nom, type,
--                         total_weeks, intensity_zone, taper…)
-- session_templates     : entête (nom, description, notes)
-- session_template_sets : sets prescrits du template (pas d'actual,
--                         pas de calculs RTS — c'est de la prescription pure)
--
-- L'instanciation d'un session_template sur (athlete, date) crée une
-- session normale + ses sets, qui passent ensuite par le trigger
-- de calcul standard quand l'athlète saisit son réalisé.
-- ============================================================


-- ============================================================
-- BLOCK_TEMPLATES (métadonnées de bloc réutilisables)
-- ============================================================
create table if not exists block_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  type text not null check (type in ('Accumulation', 'Intensification', 'Réalisation', 'Deload')),
  total_weeks int,
  intensity_zone text,
  weeks_to_competition int,
  is_taper boolean not null default false,
  taper_volume_reduction_pct decimal(5,2),
  created_at timestamptz not null default now()
);

alter table block_templates enable row level security;

create policy "Coach voit ses block_templates" on block_templates
  for select using (auth.uid() = coach_id);

create policy "Coach crée ses block_templates" on block_templates
  for insert with check (auth.uid() = coach_id);

create policy "Coach MAJ ses block_templates" on block_templates
  for update using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

create policy "Coach supprime ses block_templates" on block_templates
  for delete using (auth.uid() = coach_id);

create index if not exists idx_block_templates_coach on block_templates(coach_id);


-- ============================================================
-- SESSION_TEMPLATES (entête)
-- ============================================================
create table if not exists session_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  notes_coach text,
  created_at timestamptz not null default now()
);

alter table session_templates enable row level security;

create policy "Coach voit ses session_templates" on session_templates
  for select using (auth.uid() = coach_id);

create policy "Coach crée ses session_templates" on session_templates
  for insert with check (auth.uid() = coach_id);

create policy "Coach MAJ ses session_templates" on session_templates
  for update using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

create policy "Coach supprime ses session_templates" on session_templates
  for delete using (auth.uid() = coach_id);

create index if not exists idx_session_templates_coach on session_templates(coach_id);


-- ============================================================
-- SESSION_TEMPLATE_SETS (sets prescrits du template)
-- ============================================================
create table if not exists session_template_sets (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references session_templates(id) on delete cascade,
  exercise_name text not null,
  exercise_format text,
  set_number int not null,
  weight_prescribed_kg decimal(6,2),
  reps_prescribed int,
  rpe_prescribed decimal(3,1),
  tempo text,
  rom_prescribed text,
  created_at timestamptz not null default now(),
  unique (template_id, set_number)
);

alter table session_template_sets enable row level security;

create policy "Coach voit ses template sets" on session_template_sets
  for select using (
    exists (
      select 1 from session_templates t
      where t.id = session_template_sets.template_id and t.coach_id = auth.uid()
    )
  );

create policy "Coach gère ses template sets" on session_template_sets
  for all using (
    exists (
      select 1 from session_templates t
      where t.id = session_template_sets.template_id and t.coach_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from session_templates t
      where t.id = session_template_sets.template_id and t.coach_id = auth.uid()
    )
  );

create index if not exists idx_session_template_sets_template on session_template_sets(template_id);
