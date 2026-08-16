-- Durable per-user editor snapshots. The client still keeps a local cache so
-- the editor remains usable while a database is being configured.

create table if not exists public.studio_states (
  user_id text primary key,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_states_updated_at_idx
  on public.studio_states(updated_at desc);
