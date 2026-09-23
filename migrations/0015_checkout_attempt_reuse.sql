create table public.checkout_attempts (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  attempt_id uuid not null unique,
  paddle_transaction_id text unique,
  billing_price_id text not null,
  checkout_url text,
  status text not null check (status in ('creating', 'pending', 'completed', 'failed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index checkout_attempts_status_expiry_idx
  on public.checkout_attempts (status, expires_at);
