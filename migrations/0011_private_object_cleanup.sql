create table public.object_cleanup_queue (
  object_key text primary key check (char_length(object_key) between 1 and 1024),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index object_cleanup_queue_next_attempt_idx
  on public.object_cleanup_queue (next_attempt_at, created_at);
