-- LEAST and GREATEST are SQL conditional expressions, not schema-qualified
-- functions. Recreate the usage functions with valid PostgreSQL expressions.
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
    reserved_campaigns = greatest(
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
  set reserved_campaigns = greatest(reserved_campaigns - 1, 0),
      updated_at = pg_catalog.now()
  where workspace_id = target_workspace_id
    and period_start = period_start_date;
end;
$$;
