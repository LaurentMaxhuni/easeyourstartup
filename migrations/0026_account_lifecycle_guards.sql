-- Public-table guards also run during provider-side auth cascades. Do not alter
-- Neon's managed auth schema. Exceptions roll back the entire deletion.
create or replace function public.guard_workspace_deletion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(old.id::text || ':account-lifecycle', 0)
  );
  if exists (
    select 1 from public.subscriptions s
    where s.workspace_id = old.id and s.billing_provider = 'paddle'
      and s.status not in ('canceled', 'inactive')
  ) or exists (
    select 1 from public.checkout_attempts a
    where a.workspace_id = old.id and (
      a.status in ('creating', 'pending')
      or (a.status = 'completed' and not exists (
        select 1 from public.subscriptions s
        where s.workspace_id = old.id and s.billing_provider = 'paddle'
          and s.status in ('canceled', 'inactive')
      ))
    )
  ) or exists (
    select 1 from public.jobs j
    where j.workspace_id = old.id
      and j.status in ('queued', 'scanning', 'analyzing', 'generating', 'rendering')
  ) or exists (
    select 1 from public.memberships m
    where m.workspace_id = old.id and m.user_id <> old.owner_user_id
  ) then
    raise exception 'Account deletion blocked by billing, shared membership, or active jobs.';
  end if;
  return old;
end;
$$;

create trigger workspaces_guard_deletion
before delete on public.workspaces
for each row execute function public.guard_workspace_deletion();

-- A non-owner user can be deleted without cascading through their workspace.
-- Distinguish an auth cascade from an explicit membership-management operation.
create or replace function public.guard_shared_member_auth_deletion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from neon_auth."user" u where u.id = old.user_id) then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(old.workspace_id::text || ':account-lifecycle', 0)
    );
    if exists (
      select 1 from public.memberships m
      where m.workspace_id = old.workspace_id and m.user_id <> old.user_id
    ) then
      raise exception 'Account deletion blocked by shared membership.';
    end if;
  end if;
  return old;
end;
$$;

create trigger memberships_guard_auth_deletion
before delete on public.memberships
for each row execute function public.guard_shared_member_auth_deletion();

create or replace function public.guard_pending_account_work()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.workspace_id::text || ':account-lifecycle', 0)
  );
  if exists (
    select 1 from public.account_deletion_requests r
    where r.workspace_id = new.workspace_id and r.expires_at > pg_catalog.now()
  ) then
    raise exception 'Account deletion is pending. Cancel it before starting new work.';
  end if;
  return new;
end;
$$;

create trigger jobs_guard_pending_account_work
before insert or update of status on public.jobs
for each row
when (new.status in ('queued', 'scanning', 'analyzing', 'generating', 'rendering'))
execute function public.guard_pending_account_work();

create trigger checkout_attempts_guard_pending_account_work
before insert or update of status on public.checkout_attempts
for each row
when (new.status in ('creating', 'pending'))
execute function public.guard_pending_account_work();
