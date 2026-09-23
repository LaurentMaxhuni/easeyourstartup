create table public.test_pro_grants (
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  expires_at timestamptz not null,
  granted_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, workspace_id)
);

create index test_pro_grants_expiry_idx
  on public.test_pro_grants (expires_at);
