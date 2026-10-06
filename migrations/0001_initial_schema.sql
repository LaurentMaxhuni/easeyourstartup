-- Run this migration after enabling Neon Auth on the target Neon branch.
-- Neon Auth owns the neon_auth schema; application tables live in public.

create extension if not exists pgcrypto;

create type public.workspace_role as enum ('owner', 'member');
create type public.job_status as enum (
  'queued',
  'scanning',
  'analyzing',
  'generating',
  'rendering',
  'completed',
  'failed'
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_user_id uuid not null references neon_auth."user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  public_url text check (public_url is null or char_length(public_url) <= 2048),
  status text not null default 'active' check (status in ('active', 'archived')),
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  profile jsonb not null default '{}'::jsonb,
  scan_mode text not null default 'live' check (scan_mode in ('live', 'demo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

create table public.source_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete cascade,
  url text not null check (char_length(url) <= 2048),
  title text not null default '' check (char_length(title) <= 240),
  excerpt text not null default '' check (char_length(excerpt) <= 1200),
  content_hash text,
  created_at timestamptz not null default now()
);

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source_page_id uuid references public.source_pages(id) on delete set null,
  storage_path text not null check (char_length(storage_path) <= 1024),
  viewport text not null check (viewport in ('desktop', 'mobile', 'upload')),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  created_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (
    kind in ('launch', 'feature_update', 'milestone', 'waitlist', 'promotion', 'custom')
  ),
  title text not null default '' check (char_length(title) <= 180),
  status text not null default 'draft' check (
    status in ('draft', 'queued', 'generating', 'completed', 'failed', 'archived')
  ),
  generation_input jsonb not null default '{}'::jsonb,
  selected_angle jsonb,
  usage_consumed boolean not null default false,
  launch_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.channel_outputs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  channel text not null check (
    channel in ('x', 'linkedin', 'product_hunt', 'reddit', 'hacker_news', 'instagram', 'threads', 'facebook', 'email')
  ),
  output jsonb not null default '{}'::jsonb,
  regeneration_count integer not null default 0 check (regeneration_count between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, channel)
);

create table public.creative_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  composition jsonb not null default '{}'::jsonb,
  preview_storage_path text,
  export_storage_path text,
  status text not null default 'draft' check (
    status in ('draft', 'queued', 'rendering', 'completed', 'failed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.share_rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{12,80}$'),
  enabled boolean not null default true,
  approved_channel_output_ids uuid[] not null default '{}',
  approved_creative_asset_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_periods (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  completed_campaigns integer not null default 0 check (completed_campaigns >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, period_start)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  kind text not null check (kind in ('scan', 'generate', 'render', 'export')),
  status public.job_status not null default 'queued',
  progress integer not null default 0 check (progress between 0 and 100),
  idempotency_key text not null,
  result jsonb,
  error_message text check (error_message is null or char_length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_user_id uuid references neon_auth."user"(id) on delete set null,
  event_type text not null check (char_length(event_type) between 1 and 160),
  external_event_id text unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index memberships_user_idx on public.memberships(user_id);
create index projects_workspace_idx on public.projects(workspace_id);
create index source_pages_project_idx on public.source_pages(project_id);
create index captures_project_idx on public.captures(project_id);
create index campaigns_project_idx on public.campaigns(project_id);
create index channel_outputs_campaign_idx on public.channel_outputs(campaign_id);
create index creative_assets_campaign_idx on public.creative_assets(campaign_id);
create index jobs_workspace_status_idx on public.jobs(workspace_id, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create trigger workspaces_updated_at before update on public.workspaces
for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects
for each row execute function public.set_updated_at();
create trigger brand_profiles_updated_at before update on public.brand_profiles
for each row execute function public.set_updated_at();
create trigger campaigns_updated_at before update on public.campaigns
for each row execute function public.set_updated_at();
create trigger channel_outputs_updated_at before update on public.channel_outputs
for each row execute function public.set_updated_at();
create trigger creative_assets_updated_at before update on public.creative_assets
for each row execute function public.set_updated_at();
create trigger share_rooms_updated_at before update on public.share_rooms
for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();
create trigger usage_periods_updated_at before update on public.usage_periods
for each row execute function public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs
for each row execute function public.set_updated_at();

create or replace function public.ensure_workspace_for_user(
  target_user_id text,
  target_workspace_name text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_user_id, 0)
  );

  select m.workspace_id
  into workspace_id
  from public.memberships m
  where m.user_id = target_user_id::uuid
  order by m.created_at asc
  limit 1;

  if workspace_id is null then
    insert into public.workspaces (name, owner_user_id)
    values (target_workspace_name, target_user_id::uuid)
    returning id into workspace_id;

    insert into public.memberships (workspace_id, user_id, role)
    values (workspace_id, target_user_id::uuid, 'owner');
  end if;

  return workspace_id;
end;
$$;

create or replace function public.consume_campaign_usage(
  target_workspace_id uuid,
  target_campaign_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  period_start_date date := pg_catalog.date_trunc('month', pg_catalog.now())::date;
  period_end_date date := (
    pg_catalog.date_trunc('month', pg_catalog.now()) + interval '1 month'
  )::date;
begin
  update public.campaigns
  set usage_consumed = true
  where id = target_campaign_id
    and workspace_id = target_workspace_id
    and status = 'completed'
    and usage_consumed = false;

  if found then
    insert into public.usage_periods (
      workspace_id,
      period_start,
      period_end,
      completed_campaigns
    )
    values (target_workspace_id, period_start_date, period_end_date, 1)
    on conflict (workspace_id, period_start)
    do update set
      completed_campaigns = public.usage_periods.completed_campaigns + 1,
      updated_at = pg_catalog.now();
  end if;
end;
$$;
