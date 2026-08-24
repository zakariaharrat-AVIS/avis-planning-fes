-- ============================================
-- Mise à jour — Planning Avis Fès (v2)
-- À exécuter dans Supabase SQL Editor
-- Ceci ajoute : horaires libres, et prépare l'authentification
-- ============================================

-- 1. Ajouter des colonnes pour les horaires libres (heure début / fin)
alter table shifts add column if not exists start_time text;
alter table shifts add column if not exists end_time text;
alter table shifts add column if not exists label text;

-- shift_type garde des valeurs simples : 'travail', 'repos', 'recup', 'conge'
-- start_time / end_time : ex '08:00', '12:00' (uniquement pour 'travail')
-- label : texte libre optionnel, ex "Matin", "Demi-journée"

-- 2. Table pour stocker qui a le droit de modifier quoi
-- (utilisée avec Supabase Auth — voir guide de configuration)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('chef', 'lecture')),
  agency_id text references agencies(id),
  created_at timestamp with time zone default now()
);

alter table profiles enable row level security;
create policy "Chacun peut lire son propre profil" on profiles
  for select using (auth.uid() = id);

-- 3. Restreindre l'écriture aux utilisateurs connectés avec le rôle 'chef'
-- (remplace les anciennes politiques trop permissives)
drop policy if exists "Ecriture publique agents" on agents;
drop policy if exists "Suppression publique agents" on agents;
drop policy if exists "Ecriture publique shifts" on shifts;
drop policy if exists "Suppression publique shifts" on shifts;

create policy "Chef peut modifier agents" on agents
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'chef')
  );
create policy "Chef peut supprimer agents" on agents
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role = 'chef')
  );
create policy "Chef peut modifier shifts" on shifts
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'chef')
  );
create policy "Chef peut supprimer shifts" on shifts
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role = 'chef')
  );

-- 4. Nettoyer les anciens agents "Agent 1", "Agent 2", etc. pour les remplacer
-- par vos vrais noms d'agents (à faire depuis l'application une fois connecté)
delete from shifts where agent_id in (select id from agents where name like 'Agent %');
delete from agents where name like 'Agent %';
