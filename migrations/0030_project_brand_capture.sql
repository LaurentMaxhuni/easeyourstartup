-- A project's website screenshot was stored as an asset but referenced only
-- by the campaign that scanned it, so later campaigns had no capture to
-- analyze. Keep the stored screenshot on the project's brand profile.
-- Removing the asset clears the reference rather than the profile.

alter table public.brand_profiles
  add column capture_asset_id uuid references public.stored_assets(id) on delete set null;

create index brand_profiles_capture_asset_idx
  on public.brand_profiles (capture_asset_id)
  where capture_asset_id is not null;
