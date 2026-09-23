alter table public.campaigns
  add column if not exists usage_period_start date,
  add column if not exists usage_period_end date;

update public.campaigns c
set usage_period_start = coalesce(
      case
        when s.status in ('active', 'trialing')
          and s.current_period_start is not null
          and c.created_at >= s.current_period_start
          and (s.current_period_end is null or c.created_at < s.current_period_end)
        then s.current_period_start::date
      end,
      pg_catalog.date_trunc('month', c.created_at)::date
    ),
    usage_period_end = coalesce(
      case
        when s.status in ('active', 'trialing')
          and s.current_period_end is not null
          and c.created_at >= s.current_period_start
          and c.created_at < s.current_period_end
        then s.current_period_end::date
      end,
      (pg_catalog.date_trunc('month', c.created_at) + interval '1 month')::date
    )
from public.subscriptions s
where s.workspace_id = c.workspace_id
  and (c.usage_period_start is null or c.usage_period_end is null);

update public.campaigns c
set usage_period_start = pg_catalog.date_trunc('month', c.created_at)::date,
    usage_period_end = (pg_catalog.date_trunc('month', c.created_at) + interval '1 month')::date
where c.usage_period_start is null or c.usage_period_end is null;

-- Rebuild the current Pro window from authoritative campaign rows so existing
-- subscribers keep their consumed and in-flight usage through the migration.
insert into public.usage_periods (
  workspace_id, period_start, period_end, completed_campaigns, reserved_campaigns
)
select
  c.workspace_id,
  s.current_period_start::date,
  s.current_period_end::date,
  count(*) filter (where c.usage_consumed)::integer,
  count(*) filter (where c.usage_reserved and not c.usage_consumed)::integer
from public.subscriptions s
join public.campaigns c
  on c.workspace_id = s.workspace_id
 and c.usage_period_start = s.current_period_start::date
where s.billing_provider = 'paddle'
  and s.status in ('active', 'trialing')
  and s.current_period_start is not null
  and s.current_period_end is not null
group by c.workspace_id, s.current_period_start, s.current_period_end
on conflict (workspace_id, period_start) do update set
  period_end = excluded.period_end,
  completed_campaigns = excluded.completed_campaigns,
  reserved_campaigns = excluded.reserved_campaigns,
  updated_at = now();

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
  period_start_date date;
  period_end_date date;
  had_reservation boolean;
begin
  select usage_period_start, usage_period_end, usage_reserved
  into period_start_date, period_end_date, had_reservation
  from public.campaigns
  where id = target_campaign_id
    and workspace_id = target_workspace_id
    and status = 'completed'
    and usage_consumed = false
  for update;

  if not found then return; end if;

  update public.campaigns
  set usage_consumed = true, usage_reserved = false
  where id = target_campaign_id and workspace_id = target_workspace_id;

  insert into public.usage_periods (
    workspace_id, period_start, period_end, completed_campaigns, reserved_campaigns
  )
  values (
    target_workspace_id, period_start_date, period_end_date, 1, 0
  )
  on conflict (workspace_id, period_start) do update set
    period_end = excluded.period_end,
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
  period_start_date date;
begin
  select usage_period_start
  into period_start_date
  from public.campaigns
  where id = target_campaign_id
    and workspace_id = target_workspace_id
    and usage_reserved = true
    and usage_consumed = false
  for update;

  if not found then return; end if;

  update public.campaigns
  set usage_reserved = false, status = 'failed'
  where id = target_campaign_id and workspace_id = target_workspace_id;

  update public.usage_periods
  set reserved_campaigns = pg_catalog.greatest(reserved_campaigns - 1, 0),
      updated_at = pg_catalog.now()
  where workspace_id = target_workspace_id
    and period_start = period_start_date;
end;
$$;
