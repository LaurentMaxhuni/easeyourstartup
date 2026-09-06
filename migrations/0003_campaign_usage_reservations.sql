-- Reserve a campaign slot when durable generation is queued so concurrent
-- requests cannot exceed a workspace's monthly plan limit.

alter table public.usage_periods
  add column if not exists reserved_campaigns integer not null default 0
  check (reserved_campaigns >= 0);

alter table public.campaigns
  add column if not exists usage_reserved boolean not null default false;

-- Each active project owns one workspace-local slot. The partial unique index
-- lets the scan route claim a slot atomically; archived projects no longer
-- occupy a slot because the index only covers active rows.
alter table public.projects
  add column if not exists active_slot integer
  check (active_slot is null or active_slot > 0);

with numbered_active_projects as (
  select
    id,
    pg_catalog.row_number() over (
      partition by workspace_id
      order by created_at, id
    )::integer as active_slot
  from public.projects
  where status = 'active'
)
update public.projects as project
set active_slot = numbered_active_projects.active_slot
from numbered_active_projects
where project.id = numbered_active_projects.id
  and project.active_slot is null;

create unique index if not exists projects_workspace_active_slot_idx
  on public.projects (workspace_id, active_slot)
  where status = 'active' and active_slot is not null;

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
  campaign_created_at timestamptz;
  had_reservation boolean;
  period_start_date date;
  period_end_date date;
begin
  select created_at, usage_reserved
  into campaign_created_at, had_reservation
  from public.campaigns
  where id = target_campaign_id
    and workspace_id = target_workspace_id
    and status = 'completed'
    and usage_consumed = false
  for update;

  if not found then
    return;
  end if;

  update public.campaigns
  set usage_consumed = true,
      usage_reserved = false
  where id = target_campaign_id
    and workspace_id = target_workspace_id;

  period_start_date := pg_catalog.date_trunc('month', campaign_created_at)::date;
  period_end_date := (
    pg_catalog.date_trunc('month', campaign_created_at) + interval '1 month'
  )::date;

  insert into public.usage_periods (
    workspace_id,
    period_start,
    period_end,
    completed_campaigns,
    reserved_campaigns
  )
  values (
    target_workspace_id,
    period_start_date,
    period_end_date,
    1,
    0
  )
  on conflict (workspace_id, period_start)
  do update set
    completed_campaigns = public.usage_periods.completed_campaigns + 1,
    reserved_campaigns = pg_catalog.greatest(
      public.usage_periods.reserved_campaigns - case when had_reservation then 1 else 0 end,
      0
    ),
    updated_at = pg_catalog.now();
end;
$$;

create or replace function public.release_campaign_usage_reservation(
  target_workspace_id uuid,
  target_campaign_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  campaign_created_at timestamptz;
begin
  select created_at
  into campaign_created_at
  from public.campaigns
  where id = target_campaign_id
    and workspace_id = target_workspace_id
    and usage_reserved = true
    and usage_consumed = false
  for update;

  if not found then
    return;
  end if;

  update public.campaigns
  set usage_reserved = false,
      status = 'failed'
  where id = target_campaign_id
    and workspace_id = target_workspace_id;

  update public.usage_periods
  set reserved_campaigns = pg_catalog.greatest(reserved_campaigns - 1, 0),
      updated_at = pg_catalog.now()
  where workspace_id = target_workspace_id
    and period_start = pg_catalog.date_trunc('month', campaign_created_at)::date;
end;
$$;
