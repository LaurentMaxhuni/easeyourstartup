create table public.export_requests (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid not null references neon_auth."user"(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  format text not null check (format in ('png', 'zip')),
  revision bigint not null check (revision > 0),
  snapshot_state jsonb not null,
  object_key text unique,
  mime_type text check (mime_type is null or mime_type in ('image/png', 'application/zip')),
  byte_size bigint check (byte_size is null or byte_size between 1 and 50000000),
  file_name text not null check (char_length(file_name) between 1 and 120),
  download_expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check ((object_key is null and mime_type is null and byte_size is null and download_expires_at is null)
    or (object_key is not null and mime_type is not null and byte_size is not null and download_expires_at is not null))
);

create index export_requests_workspace_idx
  on public.export_requests (workspace_id, created_at desc);
create index export_requests_expiry_idx
  on public.export_requests (download_expires_at)
  where download_expires_at is not null;

create or replace function public.queue_private_export_cleanup_before_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.object_key is not null then
    insert into public.object_cleanup_queue (object_key)
    values (old.object_key)
    on conflict (object_key) do nothing;
  end if;
  return old;
end;
$$;

create trigger export_requests_queue_cleanup_before_delete
before delete on public.export_requests
for each row execute function public.queue_private_export_cleanup_before_delete();

create or replace function public.enqueue_export_job(
  target_workspace_id uuid,
  target_user_id text,
  target_project_id uuid,
  target_campaign_id uuid,
  target_active_project_limit integer,
  target_format text,
  target_revision bigint,
  target_snapshot_state jsonb,
  target_file_name text,
  target_job_id uuid,
  target_idempotency_key text,
  target_event_id uuid
)
returns table(
  job_id uuid,
  status public.job_status,
  progress integer,
  created boolean,
  allowed boolean,
  reason text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_job public.jobs%rowtype;
  latest_revision bigint;
  valid_project boolean;
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
    if existing_job.kind <> 'export' then
      return query select null::uuid, null::public.job_status, 0, false, false, 'operation_mismatch'::text;
      return;
    end if;
    return query select existing_job.id, existing_job.status, existing_job.progress, false, true, null::text;
    return;
  end if;

  if target_format not in ('png', 'zip') then
    return query select null::uuid, null::public.job_status, 0, false, false, 'unsupported_format'::text;
    return;
  end if;

  select p.id is not null into valid_project
  from public.projects p
  join public.campaigns c
    on c.project_id = p.id and c.workspace_id = p.workspace_id
  where p.id = target_project_id
    and p.workspace_id = target_workspace_id
    and p.status = 'active'
    and p.active_slot between 1 and target_active_project_limit
    and c.id = target_campaign_id
    and c.status = 'completed'
  limit 1;
  if coalesce(valid_project, false) is false then
    return query select null::uuid, null::public.job_status, 0, false, false, 'project_or_campaign_unavailable'::text;
    return;
  end if;

  select s.revision into latest_revision
  from public.studio_states s
  where s.user_id = target_user_id
    and s.project_id = target_project_id
    and s.campaign_id = target_campaign_id
  for update;
  if latest_revision is distinct from target_revision then
    return query select null::uuid, null::public.job_status, 0, false, false, 'revision_changed'::text;
    return;
  end if;

  insert into public.jobs (
    id, workspace_id, project_id, campaign_id, kind, status, progress, idempotency_key
  ) values (
    target_job_id, target_workspace_id, target_project_id, target_campaign_id,
    'export', 'queued', 0, target_idempotency_key
  );

  insert into public.export_requests (
    job_id, workspace_id, requested_by, project_id, campaign_id,
    format, revision, snapshot_state, file_name
  ) values (
    target_job_id, target_workspace_id, target_user_id::uuid, target_project_id, target_campaign_id,
    target_format, target_revision, target_snapshot_state, target_file_name
  );

  insert into public.job_outbox (
    event_id, workspace_id, job_id, event_name, event_payload
  ) values (
    target_event_id, target_workspace_id, target_job_id,
    'campaign/export.requested',
    pg_catalog.jsonb_build_object('jobId', target_job_id, 'workspaceId', target_workspace_id)
  );

  return query select target_job_id, 'queued'::public.job_status, 0, true, true, null::text;
end;
$$;
