-- ============================================
-- Schéma de base de données — Planning Avis Fès
-- À exécuter dans Supabase : SQL Editor > New query
-- ============================================

-- Table des agences
create table agencies (
  id text primary key,
  name text not null
);

insert into agencies (id, name) values
  ('fez', 'FES Aéroport (FEZ)'),
  ('fz2', 'FES Centre-Ville (FZ2)');

-- Table des agents
create table agents (
  id uuid primary key default gen_random_uuid(),
  agency_id text references agencies(id) not null,
  name text not null,
  created_at timestamp with time zone default now()
);

-- Table du planning (un enregistrement par agent/jour/semaine)
create table shifts (
  id uuid primary key default gen_random_uuid(),
  agency_id text references agencies(id) not null,
  agent_id uuid references agents(id) on delete cascade not null,
  week_start date not null,
  day_index int not null check (day_index >= 0 and day_index <= 6),
  shift_type text not null,
  created_at timestamp with time zone default now()
);

create index idx_shifts_lookup on shifts (agency_id, week_start);
create index idx_agents_agency on agents (agency_id);

-- Activer l'accès en temps réel (pour que les mises à jour apparaissent instantanément)
alter publication supabase_realtime add table shifts;
alter publication supabase_realtime add table agents;

-- Sécurité : accès en lecture pour tous, écriture ouverte (à restreindre plus tard avec authentification)
alter table agencies enable row level security;
alter table agents enable row level security;
alter table shifts enable row level security;

create policy "Lecture publique agences" on agencies for select using (true);
create policy "Lecture publique agents" on agents for select using (true);
create policy "Ecriture publique agents" on agents for insert with check (true);
create policy "Suppression publique agents" on agents for delete using (true);
create policy "Lecture publique shifts" on shifts for select using (true);
create policy "Ecriture publique shifts" on shifts for insert with check (true);
create policy "Suppression publique shifts" on shifts for delete using (true);

-- Agents par défaut pour démarrer (à modifier ensuite dans l'app)
insert into agents (agency_id, name) values
  ('fez', 'Agent 1'), ('fez', 'Agent 2'), ('fez', 'Agent 3'),
  ('fez', 'Agent 4'), ('fez', 'Agent 5'), ('fez', 'Agent 6'), ('fez', 'Agent 7'),
  ('fz2', 'Agent 1'), ('fz2', 'Agent 2'), ('fz2', 'Agent 3'),
  ('fz2', 'Agent 4'), ('fz2', 'Agent 5'), ('fz2', 'Agent 6'), ('fz2', 'Agent 7');
