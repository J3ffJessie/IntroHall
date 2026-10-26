-- Store intrinsic image size so pages can show the whole banner at its own aspect ratio
-- without layout shift. Nullable: rows uploaded before this migration have no size.

set lock_timeout = '5s';
set statement_timeout = '60s';

alter table public.event_assets
  add column width integer check (width is null or width between 1 and 20000),
  add column height integer check (height is null or height between 1 and 20000);

grant insert (width, height) on public.event_assets to authenticated;
