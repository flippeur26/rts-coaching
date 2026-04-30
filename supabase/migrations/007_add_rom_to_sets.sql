-- ============================================================
-- Migration 007 : Range of Motion (ROM) sur les sets
-- ============================================================
-- Permet au coach de prescrire / à l'athlète de noter une amplitude
-- particulière : "Full", "Top 1/2", "Bottom 1/2", "1.5 reps", "Pause 2s", etc.
-- Champs texte libre, séparés prescrit / réalisé pour pouvoir les comparer.

ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS rom_prescribed text,
  ADD COLUMN IF NOT EXISTS rom_actual text;

COMMENT ON COLUMN sets.rom_prescribed IS 'ROM prescrite (texte libre — ex: "Full", "Top 1/2", "1.5 reps", "Pause 2s")';
COMMENT ON COLUMN sets.rom_actual IS 'ROM effectivement réalisée par l''athlète';
