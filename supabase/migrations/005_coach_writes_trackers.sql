-- ============================================================
-- Migration 005 : Coach peut créer/mettre à jour les traceurs
--                de SES athlètes (utile pour saisir poids de
--                corps / TRAC entry depuis la vue calendrier coach).
-- ============================================================
-- Avant cette migration, seul l'athlète pouvait insérer dans daily_trackers
-- (policy "Athlète gère ses traceurs"). On ajoute des policies coach pour
-- INSERT et UPDATE limitées aux athlètes liés via coach_athlete.

-- INSERT
drop policy if exists "Coach insère traceurs de ses athlètes" on daily_trackers;
create policy "Coach insère traceurs de ses athlètes" on daily_trackers
  for insert with check (
    exists (
      select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = daily_trackers.athlete_id
    )
  );

-- UPDATE
drop policy if exists "Coach met à jour traceurs de ses athlètes" on daily_trackers;
create policy "Coach met à jour traceurs de ses athlètes" on daily_trackers
  for update using (
    exists (
      select 1 from coach_athlete ca
      where ca.coach_id = auth.uid()
        and ca.athlete_id = daily_trackers.athlete_id
    )
  );
