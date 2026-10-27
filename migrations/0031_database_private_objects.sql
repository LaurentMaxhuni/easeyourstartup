-- Private files (screenshots, uploads, exports) previously required S3-compatible
-- object storage. When none is configured, object-storage.ts keeps each file's
-- bytes here under the same object key, so stored_assets and the cleanup queue
-- work unchanged. Access stays server-side; the app never exposes this table.

create table public.private_objects (
  object_key text primary key check (char_length(object_key) between 1 and 1024),
  mime_type text not null check (char_length(mime_type) between 1 and 120),
  body bytea not null check (octet_length(body) between 1 and 20000000),
  created_at timestamptz not null default now()
);

alter table public.private_objects enable row level security;
