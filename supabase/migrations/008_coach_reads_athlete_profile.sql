-- ============================================================
-- Migration 008 : Coach peut lire les profils de ses athlètes
-- ============================================================
-- Avant cette migration, la seule policy SELECT sur `profiles` était
-- `auth.uid() = id` (lecture du profil propre uniquement). Donc le coach
-- recevait NULL en lisant `from('profiles').select(...).eq('id', athleteId)`,
-- ce qui faisait planter en 404 toutes les nouvelles pages athlète-scoped.
--
-- On ajoute deux policies :
--   - Coach lit profils de ses athlètes liés (via coach_athlete)
--   - Athlète lit profils de ses coachs liés (symétrique, utile pour l'UI athlète)

DROP POLICY IF EXISTS "Coach lit profils de ses athlètes" ON profiles;
CREATE POLICY "Coach lit profils de ses athlètes" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM coach_athlete ca
      WHERE ca.coach_id = auth.uid()
        AND ca.athlete_id = profiles.id
    )
  );

DROP POLICY IF EXISTS "Athlète lit profils de ses coachs" ON profiles;
CREATE POLICY "Athlète lit profils de ses coachs" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM coach_athlete ca
      WHERE ca.athlete_id = auth.uid()
        AND ca.coach_id = profiles.id
    )
  );
