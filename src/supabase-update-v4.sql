-- ============================================
-- Mise à jour v4 — Import performance & scoring
-- À exécuter dans Supabase SQL Editor
-- ============================================

-- Table de correspondance entre l'ID agent du système Avis (co_agent_id) et l'agent dans notre app
create table if not exists agent_id_mapping (
  id uuid primary key default gen_random_uuid(),
  co_agent_id text not null,
  agent_id uuid references agents(id) on delete cascade,
  created_at timestamp with time zone default now(),
  unique(co_agent_id)
);

-- Table stockant les données de performance importées, mois par mois
create table if not exists performance_imports (
  id uuid primary key default gen_random_uuid(),
  co_agent_id text not null,
  agency_mnemonic text,           -- ex: FEZ, FZ2
  year int not null,
  month text not null,            -- ex: "August"
  rentals numeric default 0,
  scdw_rate numeric default 0,    -- déjà un taux 0-1 dans le fichier
  rsn_rate numeric default 0,
  pai_rate numeric default 0,
  lli_rate numeric default 0,
  upsell_rate numeric default 0,
  fuf_count numeric default 0,    -- nombre brut, à diviser par rentals
  wifi_count numeric default 0,   -- nombre brut, à diviser par rentals
  score numeric,                  -- score calculé et stocké au moment de l'import
  imported_at timestamp with time zone default now(),
  unique(co_agent_id, year, month)
);

alter table agent_id_mapping enable row level security;
alter table performance_imports enable row level security;

create policy "Chef peut tout faire sur mapping" on agent_id_mapping
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'chef')
  );
create policy "Chef peut tout faire sur performance" on performance_imports
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'chef')
  );
