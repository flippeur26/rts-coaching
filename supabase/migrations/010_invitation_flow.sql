-- ============================================================
-- Migration 010 : Flux d'invitation coach ↔ athlète (consentement)
-- ============================================================
-- AVANT : un coach pouvait lier n'importe quel athlète par email,
-- accédant immédiatement à toutes ses données. Aucun consentement.
--
-- APRÈS : la relation coach_athlete a un statut :
--   - 'pending'  : invitation envoyée par le coach, en attente
--   - 'accepted' : invitation acceptée → accès activé
--   - 'rejected' : invitation refusée (l'athlète peut changer d'avis)
--
-- Backfill : toutes les relations existantes sont passées en 'accepted'
-- pour ne pas casser les comptes en cours.
--
-- Defense in depth : trigger BEFORE INSERT sur blocks/sessions/competitions
-- bloque la création de nouvelles données pour un athlète sans lien actif.
-- ============================================================


-- ============================================================
-- 1. SCHÉMA : status, accepted_at, rejected_at
-- ============================================================
alter table coach_athlete
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected'));

alter table coach_athlete
  add column if not exists accepted_at timestamptz;

alter table coach_athlete
  add column if not exists rejected_at timestamptz;

-- Backfill ONE-SHOT : relations existantes = acceptées (accès préservé)
-- Le NOT EXISTS rend la migration idempotente : une fois qu'au moins une
-- relation a été promue (= migration exécutée), les nouvelles invitations
-- 'pending' légitimes ne sont plus écrasées si on rejoue le script.
update coach_athlete
set status = 'accepted',
    accepted_at = coalesce(accepted_at, created_at)
where status = 'pending'
  and accepted_at is null
  and not exists (
    select 1 from coach_athlete where status <> 'pending'
  );

-- Index pour requêtes "mes invitations en attente"
create index if not exists idx_coach_athlete_status on coach_athlete(status);


-- ============================================================
-- 2. RLS coach_athlete
-- ============================================================
-- Coach INSERT : doit créer en 'pending' (pas d'auto-acceptation)
drop policy if exists "Coach crée ses relations" on coach_athlete;
create policy "Coach crée ses relations" on coach_athlete
  for insert with check (auth.uid() = coach_id and status = 'pending');

-- Athlète UPDATE : peut changer son propre statut (accepter / refuser / re-accepter)
drop policy if exists "Athlète gère statut invitation" on coach_athlete;
create policy "Athlète gère statut invitation" on coach_athlete
  for update
  using (auth.uid() = athlete_id)
  with check (auth.uid() = athlete_id);

-- Athlète DELETE : peut se délier d'un coach
drop policy if exists "Athlète supprime ses relations" on coach_athlete;
create policy "Athlète supprime ses relations" on coach_athlete
  for delete using (auth.uid() = athlete_id);


-- ============================================================
-- 3. TRIGGER : immutabilité coach_id/athlete_id + transitions valides
--             + auto-set timestamps
-- ============================================================
create or replace function relation_update_guard()
returns trigger language plpgsql as $$
begin
  -- Champs immuables
  if old.coach_id is distinct from new.coach_id then
    raise exception 'coach_id immuable';
  end if;
  if old.athlete_id is distinct from new.athlete_id then
    raise exception 'athlete_id immuable';
  end if;
  if old.created_at is distinct from new.created_at then
    raise exception 'created_at immuable';
  end if;

  -- Transitions de statut autorisées :
  --   pending  → accepted | rejected
  --   accepted → rejected
  --   rejected → accepted
  if old.status is distinct from new.status then
    if old.status = 'pending' and new.status not in ('accepted', 'rejected') then
      raise exception 'Transition de statut invalide: % → %', old.status, new.status;
    end if;
    if old.status in ('accepted', 'rejected') and new.status = 'pending' then
      raise exception 'Retour à pending interdit (utiliser DELETE puis INSERT)';
    end if;
  end if;

  -- Auto-set timestamps
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    new.accepted_at := now();
  end if;
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    new.rejected_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_relation_update_guard on coach_athlete;
create trigger trg_relation_update_guard
  before update on coach_athlete
  for each row execute function relation_update_guard();


-- ============================================================
-- 4. HELPER : has_active_link(coach, athlete)
-- ============================================================
create or replace function has_active_link(p_coach uuid, p_athlete uuid)
returns boolean
language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from coach_athlete
    where coach_id = p_coach
      and athlete_id = p_athlete
      and status = 'accepted'
  );
$$;


-- ============================================================
-- 5. DEFENSE IN DEPTH : INSERT seulement si lien accepté
-- ============================================================
-- Empêche la création de blocks/sessions/competitions pour un athlète
-- sans lien actif, même si l'API est contournée.

create or replace function require_active_link_for_insert()
returns trigger language plpgsql security definer as $$
begin
  if not has_active_link(new.coach_id, new.athlete_id) then
    raise exception 'Aucun lien coach-athlète accepté pour coach=% athlete=%',
      new.coach_id, new.athlete_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_blocks_require_link on blocks;
create trigger trg_blocks_require_link
  before insert on blocks
  for each row execute function require_active_link_for_insert();

drop trigger if exists trg_sessions_require_link on sessions;
create trigger trg_sessions_require_link
  before insert on sessions
  for each row execute function require_active_link_for_insert();

drop trigger if exists trg_competitions_require_link on competitions;
create trigger trg_competitions_require_link
  before insert on competitions
  for each row execute function require_active_link_for_insert();


-- ============================================================
-- 6. RLS dépendantes : exiger lien accepté
-- ============================================================

-- profiles (migration 008) : coach lit profils d'athlètes liés en 'accepted'
drop policy if exists "Coach lit profils de ses athlètes" on profiles;
create policy "Coach lit profils de ses athlètes" on profiles
  for select using (has_active_link(auth.uid(), profiles.id));

drop policy if exists "Athlète lit profils de ses coachs" on profiles;
create policy "Athlète lit profils de ses coachs" on profiles
  for select using (has_active_link(profiles.id, auth.uid()));

-- daily_trackers (migration 005) : coach SELECT/INSERT/UPDATE seulement si accepté
drop policy if exists "Coach voit les traceurs de ses athlètes" on daily_trackers;
create policy "Coach voit les traceurs de ses athlètes" on daily_trackers
  for select using (has_active_link(auth.uid(), daily_trackers.athlete_id));

drop policy if exists "Coach insère traceurs de ses athlètes" on daily_trackers;
create policy "Coach insère traceurs de ses athlètes" on daily_trackers
  for insert with check (has_active_link(auth.uid(), daily_trackers.athlete_id));

drop policy if exists "Coach met à jour traceurs de ses athlètes" on daily_trackers;
create policy "Coach met à jour traceurs de ses athlètes" on daily_trackers
  for update
  using (has_active_link(auth.uid(), daily_trackers.athlete_id))
  with check (has_active_link(auth.uid(), daily_trackers.athlete_id));


-- ============================================================
-- HOW-TO
-- ============================================================
-- Côté API :
--   - POST /api/athletes/invitations   (coach invite par email)
--   - GET  /api/athletes/invitations   (liste, role-aware)
--   - PATCH /api/athletes/invitations/[coachId]  (athlète accepte/refuse)
--   - DELETE /api/athletes/invitations/[otherUserId]  (cancel/unlink)
--
-- Pour re-inviter un athlète après un refus, le coach DELETE puis POST.
-- ============================================================
