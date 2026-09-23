create table public.founding_slots (
  slot smallint primary key check (slot between 1 and 10),
  workspace_id uuid unique references public.workspaces(id) on delete cascade,
  assigned_at timestamptz,
  redeemed_at timestamptz
);

alter table public.subscriptions
  add column if not exists last_event_occurred_at timestamptz;

insert into public.founding_slots (slot)
select slot::smallint from pg_catalog.generate_series(1, 10) as slots(slot)
on conflict (slot) do nothing;

create or replace function public.assign_founding_slot(target_workspace_id uuid)
returns smallint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  assigned_slot smallint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_workspace_id::text, 0)
  );
  select slot into assigned_slot
  from public.founding_slots
  where workspace_id = target_workspace_id;
  if found then return assigned_slot; end if;

  select slot into assigned_slot
  from public.founding_slots
  where workspace_id is null
  order by slot
  for update skip locked
  limit 1;
  if not found then return null; end if;

  update public.founding_slots
  set workspace_id = target_workspace_id, assigned_at = pg_catalog.now()
  where slot = assigned_slot;
  return assigned_slot;
end;
$$;
