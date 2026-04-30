-- Migration 002 : Tables lookup (e1RM, Central Stress, Peripheral Stress, Total Stress)
-- Ces tables sont en lecture seule pour les utilisateurs.
-- Elles remplacent le hard-coding des valeurs dans le code.

-- ============================================================
-- TABLE E1RM (RPE 5–10 par 0.5, Reps 1–12)
-- ============================================================
create table lookup_e1rm (
  rpe decimal(3,1) not null,
  reps int not null,
  pct decimal(6,4) not null,
  primary key (rpe, reps)
);

-- Lecture publique (données non sensibles)
alter table lookup_e1rm enable row level security;
create policy "Lecture publique e1rm" on lookup_e1rm for select using (true);

-- ============================================================
-- TABLE CENTRAL STRESS (RPE 5–10, Reps 1–15)
-- ============================================================
create table lookup_central_stress (
  rpe decimal(3,1) not null,
  reps int not null,
  value decimal(4,2) not null,
  primary key (rpe, reps)
);

alter table lookup_central_stress enable row level security;
create policy "Lecture publique central_stress" on lookup_central_stress for select using (true);

-- ============================================================
-- TABLE PERIPHERAL STRESS (RPE 5–10, Reps 1–15)
-- ============================================================
create table lookup_peripheral_stress (
  rpe decimal(3,1) not null,
  reps int not null,
  value decimal(4,2) not null,
  primary key (rpe, reps)
);

alter table lookup_peripheral_stress enable row level security;
create policy "Lecture publique peripheral_stress" on lookup_peripheral_stress for select using (true);

-- ============================================================
-- TABLE TOTAL STRESS (RPE 5–10, Reps 1–15)
-- ============================================================
create table lookup_total_stress (
  rpe decimal(3,1) not null,
  reps int not null,
  value decimal(4,2) not null,
  primary key (rpe, reps)
);

alter table lookup_total_stress enable row level security;
create policy "Lecture publique total_stress" on lookup_total_stress for select using (true);
