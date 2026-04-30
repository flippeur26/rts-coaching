-- Catalogue d'exercices (system + custom par coach)
CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'Squat', 'Hinge', 'Horizontal Push', 'Horizontal Pull',
    'Vertical Push', 'Vertical Pull', 'Accessoire', 'Cardio'
  )),
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, coach_id)
);

-- RLS exercises
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

-- Lecture : coach voit ses exos + les globaux (coach_id IS NULL)
CREATE POLICY "exercises_select" ON exercises FOR SELECT
  USING (coach_id IS NULL OR coach_id = auth.uid());

-- Insertion : coach peut créer ses propres exos
CREATE POLICY "exercises_insert" ON exercises FOR INSERT
  WITH CHECK (coach_id = auth.uid());

-- Suppression : uniquement les siens
CREATE POLICY "exercises_delete" ON exercises FOR DELETE
  USING (coach_id = auth.uid());

-- Exercices système de base
INSERT INTO exercises (name, category) VALUES
  ('Squat', 'Squat'),
  ('Front Squat', 'Squat'),
  ('Box Squat', 'Squat'),
  ('Leg Press', 'Squat'),
  ('Hack Squat', 'Squat'),
  ('Deadlift', 'Hinge'),
  ('Romanian Deadlift', 'Hinge'),
  ('Sumo Deadlift', 'Hinge'),
  ('Good Morning', 'Hinge'),
  ('Hip Thrust', 'Hinge'),
  ('Bench Press', 'Horizontal Push'),
  ('Close Grip Bench', 'Horizontal Push'),
  ('Incline Bench', 'Horizontal Push'),
  ('Dumbbell Bench', 'Horizontal Push'),
  ('Floor Press', 'Horizontal Push'),
  ('Barbell Row', 'Horizontal Pull'),
  ('Pendlay Row', 'Horizontal Pull'),
  ('Seal Row', 'Horizontal Pull'),
  ('Dumbbell Row', 'Horizontal Pull'),
  ('Machine Row', 'Horizontal Pull'),
  ('Overhead Press', 'Vertical Push'),
  ('Push Press', 'Vertical Push'),
  ('Dumbbell Press', 'Vertical Push'),
  ('Machine Shoulder Press', 'Vertical Push'),
  ('Pull-up', 'Vertical Pull'),
  ('Lat Pulldown', 'Vertical Pull'),
  ('Assisted Pull-up', 'Vertical Pull'),
  ('Machine Pulldown', 'Vertical Pull'),
  ('Band Rows', 'Accessoire'),
  ('Face Pulls', 'Accessoire'),
  ('Lateral Raises', 'Accessoire'),
  ('Bicep Curls', 'Accessoire'),
  ('Tricep Extensions', 'Accessoire'),
  ('Ab Wheel', 'Accessoire'),
  ('Planks', 'Accessoire'),
  ('Treadmill', 'Cardio'),
  ('Rowing Machine', 'Cardio'),
  ('Bike', 'Cardio'),
  ('Elliptical', 'Cardio');
