alter table public.channel_outputs
  add column if not exists regeneration_reserved integer not null default 0
  check (regeneration_reserved between 0 and 5);

alter table public.jobs
  add column if not exists regeneration_channel text
  check (regeneration_channel is null or regeneration_channel in (
    'x', 'linkedin', 'product_hunt', 'reddit', 'hacker_news',
    'instagram', 'threads', 'facebook', 'email'
  ));

create or replace function public.reserve_channel_regeneration(
  target_workspace_id uuid,
  target_project_id uuid,
  target_campaign_id uuid,
  target_channel text,
  target_job_id uuid,
  target_idempotency_key text,
  target_limit integer
)
returns table(
  job_id uuid,
  status public.job_status,
  progress integer,
  campaign_id uuid,
  created boolean,
  allowed boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_job public.jobs%rowtype;
  selected_project_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_workspace_id::text || ':' || target_idempotency_key, 0)
  );

  select j.* into existing_job
  from public.jobs j
  where j.workspace_id = target_workspace_id
    and j.idempotency_key = target_idempotency_key
  limit 1;
  if found then
    return query select existing_job.id, existing_job.status, existing_job.progress,
      existing_job.campaign_id, false, true;
    return;
  end if;

  select c.project_id into selected_project_id
  from public.campaigns c
  join public.projects p on p.id = c.project_id
  where c.id = target_campaign_id
    and c.project_id = target_project_id
    and c.workspace_id = target_workspace_id
    and c.status = 'completed'
    and p.workspace_id = target_workspace_id
    and p.status = 'active'
    and p.active_slot is not null
  limit 1;
  if not found then
    return query select null::uuid, null::public.job_status, 0, target_campaign_id, false, false;
    return;
  end if;

  update public.channel_outputs o
  set regeneration_reserved = o.regeneration_reserved + 1,
      updated_at = pg_catalog.now()
  where o.workspace_id = target_workspace_id
    and o.campaign_id = target_campaign_id
    and o.channel = target_channel
    and o.regeneration_count + o.regeneration_reserved < target_limit;
  if not found then
    return query select null::uuid, null::public.job_status, 0, target_campaign_id, false, false;
    return;
  end if;

  insert into public.jobs (
    id, workspace_id, project_id, campaign_id, kind, status, progress,
    idempotency_key, regeneration_channel
  ) values (
    target_job_id, target_workspace_id, selected_project_id, target_campaign_id,
    'generate', 'queued', 0, target_idempotency_key, target_channel
  );

  return query select target_job_id, 'queued'::public.job_status, 0,
    target_campaign_id, true, true;
end;
$$;
