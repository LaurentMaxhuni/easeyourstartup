create table public.render_requests (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  revision bigint not null check (revision > 0),
  composition jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index render_requests_expires_at_idx on public.render_requests (expires_at);
