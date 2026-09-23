-- Associate autosaved editor snapshots with their project and campaign while
-- preserving the legacy one-row-per-user snapshots for safe import/recovery.

alter table public.studio_states
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists revision bigint not null default 1;

update public.studio_states
set id = gen_random_uuid()
where id is null;

alter table public.studio_states alter column id set not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.studio_states'::regclass
      and contype = 'p'
  ) then
    alter table public.studio_states drop constraint studio_states_pkey;
  end if;
end;
$$;

alter table public.studio_states add constraint studio_states_pkey primary key (id);

create unique index if not exists studio_states_legacy_user_idx
  on public.studio_states (user_id)
  where project_id is null;

create unique index if not exists studio_states_project_campaign_idx
  on public.studio_states (
    user_id,
    project_id,
    (coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  where project_id is not null;

create index if not exists studio_states_campaign_idx
  on public.studio_states (campaign_id)
  where campaign_id is not null;
