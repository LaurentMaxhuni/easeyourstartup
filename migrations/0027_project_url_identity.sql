-- Keep URL identity scoped to the workspace. Paths and query values stay distinct.
create or replace function public.project_url_key(value text)
returns text language sql immutable strict set search_path = '' as $$
  select pg_catalog.regexp_replace(
    pg_catalog.lower(substring(pg_catalog.btrim(value) from '^(https?://[^/?#]+)')) ||
    substring(pg_catalog.split_part(pg_catalog.btrim(value), '#', 1) from '^https?://[^/?#]+(.*)$'),
    '/+(\?|$)', '\1', 'g'
  );
$$;

create index if not exists projects_workspace_url_key_idx
  on public.projects (workspace_id, public.project_url_key(public_url));

create or replace function public.get_or_create_scan_project(
  target_workspace_id uuid, target_project_id uuid, target_project_name text,
  target_public_url text, target_active_project_limit integer
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  selected_project public.projects%rowtype;
  selected_slot integer;
  selected_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_workspace_id::text || ':project-slots', 0)
  );
  if target_project_id is not null and not exists (
    select 1 from public.projects p
    where p.id = target_project_id and p.workspace_id = target_workspace_id
      and p.status = 'active' and p.active_slot between 1 and target_active_project_limit
  ) then return null; end if;

  select p.* into selected_project from public.projects p
  where p.workspace_id = target_workspace_id
    and public.project_url_key(p.public_url) = public.project_url_key(target_public_url)
  order by (p.status = 'active') desc, (p.id = target_project_id) desc nulls last,
    p.last_scanned_at desc nulls last, p.created_at desc
  limit 1;

  if found and selected_project.status = 'active' then
    if selected_project.active_slot is null or selected_project.active_slot not between 1 and target_active_project_limit then return null; end if;
    update public.projects set name = target_project_name, public_url = target_public_url,
      updated_at = pg_catalog.now() where id = selected_project.id;
    return selected_project.id;
  end if;
  if selected_project.id is null and target_project_id is not null then
    update public.projects set name = target_project_name, public_url = target_public_url,
      updated_at = pg_catalog.now() where id = target_project_id;
    return target_project_id;
  end if;

  select slots.slot::integer into selected_slot
  from pg_catalog.generate_series(1, target_active_project_limit) as slots(slot)
  where not exists (
    select 1 from public.projects p where p.workspace_id = target_workspace_id
      and p.status = 'active' and p.active_slot = slots.slot
  ) order by slots.slot limit 1;
  if not found then return null; end if;

  if selected_project.id is not null then
    update public.projects set status = 'active', active_slot = selected_slot,
      name = target_project_name, public_url = target_public_url, updated_at = pg_catalog.now()
    where id = selected_project.id;
    return selected_project.id;
  end if;
  insert into public.projects (workspace_id, name, public_url, active_slot)
  values (target_workspace_id, target_project_name, target_public_url, selected_slot)
  returning id into selected_id;
  return selected_id;
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

  selected_project_id := public.get_or_create_scan_project(
    target_workspace_id, target_project_id, target_project_name,
    target_public_url, target_active_project_limit
  );
  if selected_project_id is null then
    return query select null::uuid, null::public.job_status, 0, null::uuid, false, false;
    return;
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

