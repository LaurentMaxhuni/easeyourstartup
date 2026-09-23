create or replace function public.persist_project_scan(
  target_workspace_id uuid,
  target_project_id uuid,
  target_scan_job_id uuid,
  target_profile jsonb,
  target_scan_mode text,
  target_pages jsonb,
  target_job_result jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_profile_id uuid;
  current_job_created_at timestamptz;
  current_job_status public.job_status;
begin
  if target_scan_mode not in ('live', 'demo') then
    raise exception 'Invalid scan mode';
  end if;
  if jsonb_typeof(target_pages) <> 'array' then
    raise exception 'Scan pages must be an array';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_project_id::text, 0)
  );

  perform 1
  from public.projects p
  where p.id = target_project_id
    and p.workspace_id = target_workspace_id
    and p.status = 'active'
  for update;
  if not found then
    raise exception 'Project not found or is not active';
  end if;

  if target_scan_job_id is not null then
    select j.created_at, j.status
      into current_job_created_at, current_job_status
    from public.jobs j
    where j.id = target_scan_job_id
      and j.workspace_id = target_workspace_id
      and j.project_id = target_project_id
      and j.kind = 'scan'
    for update;
    if not found then
      raise exception 'Scan job not found';
    end if;
    if current_job_status = 'completed' then
      return true;
    end if;
    if current_job_status = 'failed' then
      return false;
    end if;

    if exists (
      select 1
      from public.jobs newer
      where newer.project_id = target_project_id
        and newer.workspace_id = target_workspace_id
        and newer.kind = 'scan'
        and (newer.created_at, newer.id) > (current_job_created_at, target_scan_job_id)
    ) then
      update public.jobs
      set status = 'failed',
        error_message = 'A newer scan was requested before this scan finished.',
        updated_at = pg_catalog.now()
      where id = target_scan_job_id and workspace_id = target_workspace_id;
      return false;
    end if;
  end if;

  insert into public.brand_profiles (
    workspace_id, project_id, version, profile, scan_mode
  )
  values (
    target_workspace_id, target_project_id, 1, target_profile, target_scan_mode
  )
  on conflict (project_id) do update set
    workspace_id = excluded.workspace_id,
    version = public.brand_profiles.version + 1,
    profile = excluded.profile,
    scan_mode = excluded.scan_mode,
    updated_at = pg_catalog.now()
  returning id into selected_profile_id;

  delete from public.source_pages
  where project_id = target_project_id
    and workspace_id = target_workspace_id;

  insert into public.source_pages (
    workspace_id, project_id, brand_profile_id, url, title, excerpt
  )
  select target_workspace_id, target_project_id, selected_profile_id,
    page.url, page.title, page.excerpt
  from pg_catalog.jsonb_to_recordset(target_pages)
    as page(url text, title text, excerpt text);

  update public.projects
  set last_scanned_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = target_project_id and workspace_id = target_workspace_id;

  if target_scan_job_id is not null then
    update public.jobs
    set status = 'completed', progress = 100,
      result = target_job_result, updated_at = pg_catalog.now()
    where id = target_scan_job_id and workspace_id = target_workspace_id;
  end if;

  return true;
end;
$$;
