-- Editable compositions are independent of campaign generation and share workspace ownership.
create table public.design_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  document jsonb not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index design_documents_workspace_idx on public.design_documents(workspace_id, updated_at desc);
create table public.design_versions (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null, workspace_id uuid not null,
  revision integer not null check (revision > 0), document jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (design_id, workspace_id) references public.design_documents(id, workspace_id) on delete cascade,
  unique (design_id, revision)
);
create table public.design_brand_kits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) <= 120), kit jsonb not null, assets jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
create table public.design_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  input jsonb not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  stage text not null default 'Queued', attempt integer not null default 1 check (attempt > 0),
  result jsonb, preview jsonb, error text,
  dispatched_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index design_jobs_dispatch_idx on public.design_jobs(status, dispatched_at) where status = 'queued';
create index design_jobs_workspace_idx on public.design_jobs(workspace_id, updated_at desc);
create function public.enqueue_design_job(target_workspace uuid, job_input jsonb, concurrency_limit integer)
returns setof public.design_jobs language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_workspace::text || ':design-jobs', 0));
  if (select count(*) from public.design_jobs where workspace_id = target_workspace and status in ('queued','running')) >= concurrency_limit then
    return;
  end if;
  return query insert into public.design_jobs(workspace_id, input) values (target_workspace, job_input) returning *;
end;
$$;
create function public.retry_design_job(target_workspace uuid, target_job uuid, concurrency_limit integer)
returns setof public.design_jobs language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_workspace::text || ':design-jobs', 0));
  if (select count(*) from public.design_jobs where workspace_id = target_workspace and status in ('queued','running')) >= concurrency_limit then
    return;
  end if;
  return query update public.design_jobs set status = 'queued', stage = 'Queued', error = null,
    attempt = attempt + 1, dispatched_at = null, updated_at = pg_catalog.now()
    where id = target_job and workspace_id = target_workspace and status in ('failed','cancelled') returning *;
end;
$$;
create table public.design_ai_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid not null references public.design_jobs(id) on delete cascade,
  attempt integer not null, provider text not null, model text not null,
  input_tokens integer not null, output_tokens integer not null, latency_ms integer not null, fallbacks integer not null,
  created_at timestamptz not null default now()
);
create index design_ai_events_workspace_idx on public.design_ai_events(workspace_id, created_at desc);

-- Reject new writes while an account deletion is pending, using the existing lifecycle lock.
create trigger design_jobs_guard_pending_account_work
before insert or update of status on public.design_jobs for each row
when (new.status in ('queued','running')) execute function public.guard_pending_account_work();
create trigger design_documents_guard_pending_account_work
before insert or update on public.design_documents for each row execute function public.guard_pending_account_work();
create trigger design_brand_kits_guard_pending_account_work
before insert or update on public.design_brand_kits for each row execute function public.guard_pending_account_work();

-- Deletion cancels no external jobs silently: active design work must finish or be cancelled first.
create function public.guard_design_workspace_deletion() returns trigger language plpgsql
security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.design_jobs where workspace_id = old.id and status in ('queued','running')) then
    raise exception 'Account deletion blocked by active design jobs.';
  end if;
  return old;
end;
$$;
create trigger workspaces_guard_design_deletion before delete on public.workspaces
for each row execute function public.guard_design_workspace_deletion();

-- These tables are server-only. No anonymous/authenticated direct database API grants.
alter table public.design_documents enable row level security;
alter table public.design_versions enable row level security;
alter table public.design_brand_kits enable row level security;
alter table public.design_jobs enable row level security;
alter table public.design_ai_events enable row level security;
