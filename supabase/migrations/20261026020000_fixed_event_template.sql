-- Event pages use one fixed, accessible template. Organizers no longer pick colors;
-- they supply a header banner and a link-preview (Open Graph) image.
--
-- Lock/drop warnings are suppressed below: this runs before any production deploy,
-- so there are no live clients or large tables to protect.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- squawk-ignore ban-drop-column
alter table public.events drop column theme;

-- Logo and sponsor images are no longer part of the template. Their storage objects are
-- left in the bucket (Storage forbids direct SQL deletes); nothing references them any more.
delete from public.event_assets where kind not in ('banner', 'share');

-- squawk-ignore ban-drop-constraint
alter table public.event_assets drop constraint event_assets_kind_check;
-- squawk-ignore constraint-missing-not-valid
alter table public.event_assets add constraint event_assets_kind_check check (kind in ('banner', 'share'));

-- At most one of each kind per event.
-- squawk-ignore require-concurrent-index-deletion
drop index public.event_assets_one_logo_banner;
-- squawk-ignore require-concurrent-index-creation
create unique index event_assets_one_per_kind on public.event_assets (event_id, kind);

-- squawk-ignore ban-drop-column
alter table public.event_assets drop column position;
