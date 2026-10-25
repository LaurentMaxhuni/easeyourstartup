-- Campaigns used the first 180 characters of their announcement as a title.
-- Rename those automatic titles to the generated headline, or else the
-- announcement's first sentence, cut to 70 characters at a word boundary.
-- Titles people typed themselves are left alone. updated_at is preserved so
-- the dashboard's "Updated" dates and ordering do not change.

alter table public.campaigns disable trigger campaigns_updated_at;

with sources as (
  select
    c.id,
    pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(
      (
        select j.result #>> '{generation,creativeDirections,0,headline}'
        from public.jobs j
        where j.campaign_id = c.id
          and j.kind = 'generate'
          and j.status = 'completed'
        order by j.updated_at desc
        limit 1
      ),
      c.generation_input #>> '{brief,updateDetails}',
      c.generation_input ->> 'updateDetails',
      ''
    ), '\s+', ' ', 'g')) as text
  from public.campaigns c
  where c.title = pg_catalog.left(coalesce(
      c.generation_input #>> '{brief,updateDetails}',
      c.generation_input ->> 'updateDetails'
    ), 180)
),
first_sentences as (
  select
    id,
    pg_catalog.regexp_replace(
      coalesce(pg_catalog.substring(text, '^(.*?[.!?])(?:\s|$)'), text),
      '[.!?]+$', ''
    ) as text
  from sources
)
update public.campaigns c
set title = case
  when f.text = '' then 'Untitled campaign'
  when pg_catalog.char_length(f.text) <= 70 then f.text
  else pg_catalog.regexp_replace(pg_catalog.left(f.text, 71), '[\s,;:–—-]*\S*$', '') || '…'
end
from first_sentences f
where f.id = c.id;

alter table public.campaigns enable trigger campaigns_updated_at;
