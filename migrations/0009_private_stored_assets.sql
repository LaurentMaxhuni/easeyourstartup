create table public.stored_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references neon_auth."user"(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  object_key text not null unique check (char_length(object_key) between 1 and 1024),
  mime_type text not null check (mime_type in ('image/webp', 'image/png', 'image/jpeg')),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  byte_size bigint not null check (byte_size between 1 and 12000000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index stored_assets_workspace_idx on public.stored_assets (workspace_id, created_at);
create index stored_assets_project_idx on public.stored_assets (project_id);
