-- DELETE holds the project row lock; job insertion's foreign-key lock and
-- generation's FOR UPDATE serialize with it. Check after obtaining that lock.
create or replace function public.guard_project_deletion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.jobs j
    where j.project_id = old.id
      and j.status in ('queued', 'scanning', 'analyzing', 'generating', 'rendering')
  ) or exists (
    select 1 from public.campaigns c
    where c.project_id = old.id and c.usage_reserved
  ) or exists (
    select 1 from public.channel_outputs o
    join public.campaigns c on c.id = o.campaign_id
    where c.project_id = old.id and o.regeneration_reserved > 0
  ) then
    raise exception 'Project has active work. Wait for jobs to finish before deleting it.';
  end if;
  return old;
end;
$$;

create trigger projects_guard_deletion
before delete on public.projects
for each row execute function public.guard_project_deletion();
