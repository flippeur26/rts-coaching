-- 014_block_progression_config.sql
-- Persiste les deltas du panneau "Progression vers semaine suivante" par bloc x exercice.
-- Modèle déclaratif : S2..SN = S1 + (k-1) * deltas, recalculé à chaque sync.

create table if not exists block_progression_config (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references blocks(id) on delete cascade,
  exercise_name text not null,
  weight_enabled boolean not null default false,
  weight_delta numeric(6,2) not null default 0,
  weight_type text not null default 'kg' check (weight_type in ('kg','percent')),
  reps_delta int not null default 0,
  rpe_delta numeric(3,1) not null default 0,
  sets_delta int not null default 0,
  copy_modifiers boolean not null default true,
  detect_overperformance boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (block_id, exercise_name)
);

create index if not exists idx_block_prog_cfg_block on block_progression_config(block_id);

alter table block_progression_config enable row level security;

drop policy if exists "Coach manages own block progression config" on block_progression_config;
create policy "Coach manages own block progression config"
  on block_progression_config for all
  using (
    exists (
      select 1 from blocks b
      where b.id = block_progression_config.block_id
        and b.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from blocks b
      where b.id = block_progression_config.block_id
        and b.coach_id = auth.uid()
    )
  );

-- Athlète a lecture seule sur les configs de ses blocs (utile pour /full route)
drop policy if exists "Athlete reads progression config of own blocks" on block_progression_config;
create policy "Athlete reads progression config of own blocks"
  on block_progression_config for select
  using (
    exists (
      select 1 from blocks b
      where b.id = block_progression_config.block_id
        and b.athlete_id = auth.uid()
    )
  );

drop trigger if exists trg_block_prog_cfg_updated_at on block_progression_config;
create trigger trg_block_prog_cfg_updated_at
  before update on block_progression_config
  for each row execute function set_updated_at();
