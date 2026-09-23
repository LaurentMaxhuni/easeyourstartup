-- Keep a campaign's status in sync with its initial generation job, including
-- terminal failures raised by the worker or by the outbox dead-letter path.
create or replace function public.sync_campaign_generation_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.kind <> 'generate'
    or new.regeneration_channel is not null
    or new.campaign_id is null
    or new.status not in ('queued', 'generating', 'completed', 'failed') then
    return new;
  end if;

  update public.campaigns
  set status = new.status::text,
    completed_at = case
      when new.status = 'completed' then coalesce(completed_at, pg_catalog.now())
      else null
    end,
    updated_at = pg_catalog.now()
  where id = new.campaign_id
    and workspace_id = new.workspace_id
    and status in ('draft', 'queued', 'generating');

  return new;
end;
$$;

create trigger sync_campaign_status_from_generation_job
after update of status on public.jobs
for each row
when (old.status is distinct from new.status)
execute function public.sync_campaign_generation_status();
