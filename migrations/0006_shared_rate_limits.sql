create table public.rate_limit_buckets (
  bucket_key text primary key check (char_length(bucket_key) = 64),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

create index rate_limit_buckets_window_idx
  on public.rate_limit_buckets (window_started_at);
