-- Neon Auth's managed user IDs are UUIDs on this branch.
create or replace function public.ensure_workspace_for_user(
  target_user_id uuid,
  target_workspace_name text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_user_id::text, 0)
  );

  select m.workspace_id
  into workspace_id
  from public.memberships m
  where m.user_id = target_user_id
  order by m.created_at asc
  limit 1;

  if workspace_id is null then
    insert into public.workspaces (name, owner_user_id)
    values (target_workspace_name, target_user_id)
    returning id into workspace_id;

    insert into public.memberships (workspace_id, user_id, role)
    values (workspace_id, target_user_id, 'owner');
  end if;

  return workspace_id;
end;
$$;
