alter table public.workspaces
  add column if not exists onboarding_profile jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_completed_at timestamptz;

update public.workspaces
set onboarding_completed_at = created_at
where onboarding_completed_at is null;
