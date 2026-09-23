-- Persist job dispatch requests alongside the job itself. A scheduled Inngest
-- dispatcher retries delivery after process or network failures.
create table public.job_outbox (
  event_id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  event_name text not null check (event_name in (
    'campaign/scan.requested',
    'campaign/generation.requested',
    'campaign/channel-regeneration.requested',
    'campaign/export.requested'
  )),
  event_payload jsonb not null,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default pg_catalog.now(),
  claimed_until timestamptz,
  delivered_at timestamptz,
  dead_lettered_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default pg_catalog.now()
);

create index job_outbox_pending_idx
  on public.job_outbox (available_at, created_at)
  where delivered_at is null;

create or replace function public.claim_job_outbox(target_limit integer default 20)
returns table(event_id uuid, event_name text, event_payload jsonb, attempts integer)
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select o.event_id
    from public.job_outbox o
    where o.delivered_at is null
      and o.dead_lettered_at is null
      and o.available_at <= pg_catalog.now()
      and (o.claimed_until is null or o.claimed_until <= pg_catalog.now())
    order by o.created_at, o.event_id
    for update skip locked
    limit greatest(1, least(coalesce(target_limit, 20), 100))
  ), claimed as (
    update public.job_outbox o
    set claimed_until = pg_catalog.now() + interval '2 minutes',
      attempts = o.attempts + 1,
      last_error = null
    from candidates c
    where o.event_id = c.event_id
    returning o.event_id, o.event_name, o.event_payload, o.attempts
  )
  select c.event_id, c.event_name, c.event_payload, c.attempts from claimed c;
$$;

create or replace function public.mark_job_outbox_delivered(target_event_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.job_outbox
  set delivered_at = pg_catalog.now(), claimed_until = null, last_error = null
  where event_id = target_event_id and delivered_at is null;
$$;

create or replace function public.retry_job_outbox(target_event_id uuid, target_error text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  failed_outbox public.job_outbox%rowtype;
  related_job public.jobs%rowtype;
  has_related_job boolean;
begin
  select * into failed_outbox
  from public.job_outbox
  where event_id = target_event_id and delivered_at is null
  for update;
  if not found then return; end if;

  select * into related_job from public.jobs
  where id = failed_outbox.job_id and workspace_id = failed_outbox.workspace_id
  for update;
  has_related_job := found;
  if has_related_job and related_job.status <> 'queued' then
    update public.job_outbox
    set delivered_at = pg_catalog.now(), claimed_until = null, last_error = null
    where event_id = target_event_id;
    return;
  end if;

  if failed_outbox.attempts >= 10 then
    update public.job_outbox
    set claimed_until = null,
      dead_lettered_at = pg_catalog.now(),
      last_error = pg_catalog.left(coalesce(target_error, 'Dispatch failed.'), 500)
    where event_id = target_event_id;

    if has_related_job then
      update public.jobs
      set status = 'failed',
        error_message = 'The job could not be delivered to the worker after repeated attempts.',
        updated_at = pg_catalog.now()
      where id = related_job.id and status = 'queued';

      if failed_outbox.event_name = 'campaign/generation.requested'
        and related_job.campaign_id is not null then
        perform public.release_campaign_usage_reservation(
          failed_outbox.workspace_id, related_job.campaign_id
        );
      elsif failed_outbox.event_name = 'campaign/channel-regeneration.requested'
        and related_job.campaign_id is not null
        and related_job.regeneration_channel is not null then
        update public.channel_outputs
        set regeneration_reserved = greatest(regeneration_reserved - 1, 0),
          updated_at = pg_catalog.now()
        where workspace_id = failed_outbox.workspace_id
          and campaign_id = related_job.campaign_id
          and channel = related_job.regeneration_channel;
      end if;
    end if;
    return;
  end if;

  update public.job_outbox
  set claimed_until = null,
    available_at = pg_catalog.now()
      + (least(60::double precision, pg_catalog.power(2::double precision, least(attempts, 8))) * interval '1 minute'),
    last_error = pg_catalog.left(coalesce(target_error, 'Dispatch failed.'), 500)
  where event_id = target_event_id;
end;
$$;

create or replace function public.enqueue_scan_job(
  target_workspace_id uuid,
  target_project_id uuid,
  target_project_name text,
  target_public_url text,
  target_active_project_limit integer,
  target_job_id uuid,
  target_idempotency_key text,
  target_event_id uuid
)
returns table(
  job_id uuid,
  status public.job_status,
  progress integer,
  project_id uuid,
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
  selected_slot integer;
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
      existing_job.project_id, false, true;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_workspace_id::text || ':project-slots', 0)
  );

  if target_project_id is null then
    select slots.slot::integer into selected_slot
    from pg_catalog.generate_series(1, target_active_project_limit) as slots(slot)
    where not exists (
      select 1 from public.projects p
      where p.workspace_id = target_workspace_id
        and p.status = 'active' and p.active_slot = slots.slot
    )
    order by slots.slot
    limit 1;
    if not found then
      return query select null::uuid, null::public.job_status, 0, null::uuid, false, false;
      return;
    end if;

    insert into public.projects (workspace_id, name, public_url, active_slot)
    values (target_workspace_id, target_project_name, target_public_url, selected_slot)
    returning id into selected_project_id;
  else
    update public.projects p
    set name = target_project_name,
      public_url = target_public_url,
      updated_at = pg_catalog.now()
    where p.id = target_project_id
      and p.workspace_id = target_workspace_id
      and p.status = 'active'
      and p.active_slot between 1 and target_active_project_limit
    returning p.id into selected_project_id;
    if not found then
      return query select null::uuid, null::public.job_status, 0, null::uuid, false, false;
      return;
    end if;
  end if;

  insert into public.jobs (
    id, workspace_id, project_id, kind, status, progress, idempotency_key
  ) values (
    target_job_id, target_workspace_id, selected_project_id,
    'scan', 'queued', 0, target_idempotency_key
  );

  insert into public.job_outbox (
    event_id, workspace_id, job_id, event_name, event_payload
  ) values (
    target_event_id, target_workspace_id, target_job_id,
    'campaign/scan.requested',
    pg_catalog.jsonb_build_object(
      'jobId', target_job_id,
      'workspaceId', target_workspace_id,
      'projectId', selected_project_id,
      'url', target_public_url
    )
  );

  return query select target_job_id, 'queued'::public.job_status, 0,
    selected_project_id, true, true;
end;
$$;

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

  insert into public.job_outbox (
    workspace_id, job_id, event_name, event_payload
  ) values (
    target_workspace_id, target_job_id,
    'campaign/channel-regeneration.requested',
    pg_catalog.jsonb_build_object(
      'jobId', target_job_id,
      'workspaceId', target_workspace_id,
      'projectId', selected_project_id,
      'campaignId', target_campaign_id,
      'channel', target_channel
    )
  );

  return query select target_job_id, 'queued'::public.job_status, 0,
    target_campaign_id, true, true;
end;
$$;
