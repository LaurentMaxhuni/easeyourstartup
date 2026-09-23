create table public.account_deletion_requests (
  user_id uuid primary key references neon_auth."user"(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  check (expires_at > requested_at)
);

create index account_deletion_requests_expiry_idx
  on public.account_deletion_requests (expires_at);

create or replace function public.prepare_account_deletion(
  target_user_id text,
  target_workspace_id uuid
)
returns table(allowed boolean, reason text)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_workspace_id::text || ':account-lifecycle', 0)
  );

  if not exists (
    select 1 from public.memberships m
    where m.workspace_id = target_workspace_id and m.user_id = target_user_id
  ) then
    return query select false, 'account_not_in_workspace'::text;
    return;
  end if;

  if exists (
    select 1 from public.memberships m
    where m.workspace_id = target_workspace_id and m.user_id <> target_user_id
  ) then
    return query select false, 'workspace_is_shared'::text;
    return;
  end if;

  if exists (
    select 1 from public.subscriptions s
    where s.workspace_id = target_workspace_id
      and s.billing_provider = 'paddle'
      and s.status not in ('canceled', 'inactive')
  ) then
    return query select false, 'subscription_must_end'::text;
    return;
  end if;

  if exists (
    select 1 from public.checkout_attempts a
    where a.workspace_id = target_workspace_id
      and (
        a.status in ('creating', 'pending')
        or (a.status = 'completed' and not exists (
          select 1 from public.subscriptions s
          where s.workspace_id = target_workspace_id
            and s.billing_provider = 'paddle'
            and s.status in ('canceled', 'inactive')
        ))
      )
  ) then
    return query select false, 'checkout_must_finish'::text;
    return;
  end if;

  if exists (
    select 1 from public.jobs j
    where j.workspace_id = target_workspace_id
      and j.status in ('queued', 'scanning', 'analyzing', 'generating', 'rendering')
  ) then
    return query select false, 'jobs_must_finish'::text;
    return;
  end if;

  insert into public.account_deletion_requests (user_id, workspace_id, expires_at)
  values (target_user_id, target_workspace_id, pg_catalog.now() + interval '30 minutes')
  on conflict (user_id) do update set
    workspace_id = excluded.workspace_id,
    requested_at = pg_catalog.now(),
    expires_at = excluded.expires_at;

  return query select true, null::text;
end;
$$;

create or replace function public.queue_private_asset_cleanup_before_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.object_cleanup_queue (object_key)
  values (old.object_key)
  on conflict (object_key) do nothing;
  return old;
end;
$$;

create trigger stored_assets_queue_cleanup_before_delete
before delete on public.stored_assets
for each row execute function public.queue_private_asset_cleanup_before_delete();
