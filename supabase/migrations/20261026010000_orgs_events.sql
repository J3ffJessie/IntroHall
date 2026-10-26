-- Phase 1: organizations, members, invites, events, assets, tags, storage.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Shared validation helpers
-- ---------------------------------------------------------------------------

-- Event/org slugs are DNS labels and must not collide with platform subdomains (§3, events.slug).
create function private.is_valid_slug(slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select slug ~ '^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$'
     and slug <> all (array['app','www','api','admin','auth','mail','status','docs','help','static','cdn']);
$$;

-- NFKC → casefold → trim → collapse whitespace (§3.2 upsert_interests).
create function private.normalize_tag(label text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(normalize(label, NFKC)), '\s+', ' ', 'g'));
$$;

create function private.sha256_hex(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(input, 'sha256'), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 1 and 100),
  slug           text not null unique check (private.is_valid_slug(slug)),
  plan           text not null default 'free',
  attendee_limit integer check (attendee_limit is null or attendee_limit > 0),
  suspended_at   timestamptz,
  created_at     timestamptz not null default now()
);

create table public.org_members (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references public.accounts (user_id) on delete cascade,
  role       text not null check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_id_idx on public.org_members (user_id);

create table public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  email       text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role        text not null check (role in ('admin', 'staff')),
  token_hash  text not null unique,
  invited_by  uuid references public.accounts (user_id) on delete set null,
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create index org_invites_org_id_idx on public.org_invites (org_id);

create table public.events (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations (id) on delete cascade,
  slug                   text not null unique check (private.is_valid_slug(slug)),
  name                   text not null check (char_length(btrim(name)) between 1 and 120),
  description            text not null default '' check (char_length(description) <= 2000),
  venue                  text not null default '' check (char_length(venue) <= 200),
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  timezone               text not null,
  status                 text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at           timestamptz,
  deleted_at             timestamptz,
  -- Mirrors organizations.suspended_at so the public read policy needs no cross-table lookup.
  org_suspended          boolean not null default false,
  theme                  jsonb not null default '{}'::jsonb check (jsonb_typeof(theme) = 'object'),
  join_mode              text not null default 'open' check (join_mode in ('open', 'code')),
  allow_custom_interests boolean not null default true,
  max_custom_interests   integer not null default 3 check (max_custom_interests between 0 and 10),
  retention_days         integer not null default 30 check (retention_days between 7 and 90),
  stats_dirty            boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '31 days')
);
create index events_org_id_idx on public.events (org_id);

-- Join-code hash lives apart from `events` so no API role can ever select it.
create table public.event_secrets (
  event_id       uuid primary key references public.events (id) on delete cascade,
  join_code_hash text,
  rotated_at     timestamptz
);

create table public.event_assets (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  kind         text not null check (kind in ('logo', 'banner', 'sponsor')),
  storage_path text not null unique,
  alt          text not null default '' check (char_length(alt) <= 200),
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index event_assets_event_id_idx on public.event_assets (event_id);
-- One logo and one banner per event; any number of sponsors.
create unique index event_assets_one_logo_banner on public.event_assets (event_id, kind) where kind in ('logo', 'banner');

create table public.interest_tags (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  label       text not null check (char_length(btrim(label)) between 1 and 40),
  normalized  text generated always as (private.normalize_tag(label)) stored,
  is_official boolean not null default false,
  created_by  uuid references public.accounts (user_id) on delete set null,
  hidden      boolean not null default false,
  merged_into uuid references public.interest_tags (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (event_id, normalized)
);

-- ---------------------------------------------------------------------------
-- RLS helpers (private, set-returning so policies evaluate them once per query)
-- ---------------------------------------------------------------------------
create function private.my_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
    from public.org_members m
    join public.organizations o on o.id = m.org_id
   where m.user_id = auth.uid()
     and o.suspended_at is null;
$$;

create function private.my_admin_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
    from public.org_members m
    join public.organizations o on o.id = m.org_id
   where m.user_id = auth.uid()
     and m.role in ('owner', 'admin')
     and o.suspended_at is null;
$$;

create function private.my_org_event_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
    from public.events e
   where e.org_id in (select private.my_org_ids())
     and e.deleted_at is null;
$$;

-- Events anyone (including anon) may see: published, not deleted, org not suspended.
-- Inlined into policies rather than a helper so anon needs no access to `private`.

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger events_touch_updated_at
  before update on public.events
  for each row execute function private.touch_updated_at();

create function private.events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Rejects unknown zones with an error.
  perform now() at time zone new.timezone;
  -- Printed QR codes depend on the slug (§4.2).
  if tg_op = 'UPDATE' and new.slug <> old.slug and old.published_at is not null then
    raise exception 'slug cannot change after the event is published' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger events_guard
  before insert or update on public.events
  for each row execute function private.events_guard();

create function private.events_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- org_suspended needs no init: events_insert_org only admits members of non-suspended orgs.
  insert into public.event_secrets (event_id) values (new.id);
  return null;
end;
$$;

create trigger events_after_insert
  after insert on public.events
  for each row execute function private.events_after_insert();

create function private.organizations_sync_suspension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.events
     set org_suspended = (new.suspended_at is not null)
   where org_id = new.id;
  return null;
end;
$$;

create trigger organizations_sync_suspension
  after update of suspended_at on public.organizations
  for each row
  when (old.suspended_at is distinct from new.suspended_at)
  execute function private.organizations_sync_suspension();

create function private.interest_tags_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Display form; the generated `normalized` column adds casefolding for uniqueness.
  new.label := regexp_replace(btrim(normalize(new.label, NFKC)), '\s+', ' ', 'g');
  return new;
end;
$$;

create trigger interest_tags_normalize
  before insert or update of label on public.interest_tags
  for each row execute function private.interest_tags_normalize();

-- ---------------------------------------------------------------------------
-- Grants (deny by default) and RLS
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.org_members   enable row level security;
alter table public.org_invites   enable row level security;
alter table public.events        enable row level security;
alter table public.event_secrets enable row level security;
alter table public.event_assets  enable row level security;
alter table public.interest_tags enable row level security;

revoke all on public.organizations, public.org_members, public.org_invites, public.events,
              public.event_secrets, public.event_assets, public.interest_tags
  from public, anon, authenticated;

-- organizations: members read; owner/admin rename. Created via create_organization().
grant select on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;
create policy organizations_select_member on public.organizations
  for select to authenticated using (id in (select private.my_org_ids()));
create policy organizations_update_admin on public.organizations
  for update to authenticated
  using (id in (select private.my_admin_org_ids()))
  with check (id in (select private.my_admin_org_ids()));

-- org_members: members see co-members. Changed only via RPCs.
grant select on public.org_members to authenticated;
create policy org_members_select_member on public.org_members
  for select to authenticated using (org_id in (select private.my_org_ids()));

-- org_invites: owner/admin read and revoke. Created via create_invite(); token hash never exposed.
grant select (id, org_id, email, role, invited_by, expires_at, accepted_at, created_at) on public.org_invites to authenticated;
grant delete on public.org_invites to authenticated;
create policy org_invites_select_admin on public.org_invites
  for select to authenticated using (org_id in (select private.my_admin_org_ids()));
create policy org_invites_delete_admin on public.org_invites
  for delete to authenticated using (org_id in (select private.my_admin_org_ids()) and accepted_at is null);

-- events: R2 public read when published; R1 org members read/write their org's events.
-- status/published_at change only via publish_event()/archive_event().
grant select on public.events to anon, authenticated;
grant insert (org_id, slug, name, description, venue, starts_at, ends_at, timezone, theme, join_mode,
              allow_custom_interests, max_custom_interests, retention_days)
  on public.events to authenticated;
grant update (slug, name, description, venue, starts_at, ends_at, timezone, theme, join_mode,
              allow_custom_interests, max_custom_interests, retention_days)
  on public.events to authenticated;

create policy events_select_public on public.events
  for select to anon, authenticated
  using (status = 'published' and deleted_at is null and not org_suspended);
create policy events_select_org on public.events
  for select to authenticated
  using (org_id in (select private.my_org_ids()) and deleted_at is null);
create policy events_insert_org on public.events
  for insert to authenticated
  with check (org_id in (select private.my_org_ids()));
create policy events_update_org on public.events
  for update to authenticated
  using (org_id in (select private.my_org_ids()) and deleted_at is null and status <> 'archived')
  with check (org_id in (select private.my_org_ids()));

-- event_secrets: no grants at all; only SECURITY DEFINER RPCs touch it.

-- event_assets / interest_tags: readable wherever the parent event is readable (the subquery
-- runs under the caller's RLS on events); writable by org members.
grant select on public.event_assets to anon, authenticated;
grant insert (event_id, kind, storage_path, alt, position) on public.event_assets to authenticated;
grant update (alt, position) on public.event_assets to authenticated;
grant delete on public.event_assets to authenticated;

create policy event_assets_select on public.event_assets
  for select to anon, authenticated using (event_id in (select id from public.events));
create policy event_assets_insert_org on public.event_assets
  for insert to authenticated
  with check (
    event_id in (select private.my_org_event_ids())
    -- Path must be {org_id}/{event_id}/… for this event's org (matches the storage policy).
    and storage_path like (select e.org_id::text || '/' || e.id::text || '/%' from public.events e where e.id = event_id)
  );
create policy event_assets_update_org on public.event_assets
  for update to authenticated
  using (event_id in (select private.my_org_event_ids()))
  with check (event_id in (select private.my_org_event_ids()));
create policy event_assets_delete_org on public.event_assets
  for delete to authenticated using (event_id in (select private.my_org_event_ids()));

grant select on public.interest_tags to anon, authenticated;
grant insert (event_id, label) on public.interest_tags to authenticated;
grant update (label, hidden) on public.interest_tags to authenticated;

create policy interest_tags_select_visible on public.interest_tags
  for select to anon, authenticated
  using (not hidden and event_id in (select id from public.events));
create policy interest_tags_select_org on public.interest_tags
  for select to authenticated using (event_id in (select private.my_org_event_ids()));
-- Organizer-created tags are official; attendee custom tags go through upsert_interests() (Phase 2).
create policy interest_tags_insert_org on public.interest_tags
  for insert to authenticated
  with check (event_id in (select private.my_org_event_ids()));
create policy interest_tags_update_org on public.interest_tags
  for update to authenticated
  using (event_id in (select private.my_org_event_ids()))
  with check (event_id in (select private.my_org_event_ids()));

create function private.interest_tags_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.is_official := new.event_id in (select private.my_org_event_ids());
  return new;
end;
$$;

create trigger interest_tags_defaults
  before insert on public.interest_tags
  for each row execute function private.interest_tags_defaults();

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY DEFINER: each checks auth.uid() and role first)
-- ---------------------------------------------------------------------------

create function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.accounts where user_id = v_uid and deleted_at is null) then
    raise exception 'account not found' using errcode = '42501';
  end if;
  if (select count(*) from public.org_members where user_id = v_uid and role = 'owner') >= 5 then
    raise exception 'organization limit reached' using errcode = 'P0001';
  end if;

  insert into public.organizations (name, slug) values (btrim(p_name), lower(btrim(p_slug)))
  returning id into v_org;
  insert into public.org_members (org_id, user_id, role) values (v_org, v_uid, 'owner');
  return v_org;
end;
$$;

-- Returns the raw invite token once; only its hash is stored.
create function public.create_invite(p_org_id uuid, p_email text, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
begin
  if p_org_id not in (select private.my_admin_org_ids()) then
    raise exception 'not an admin of this organization' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'staff') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if (select count(*) from public.org_invites
       where org_id = p_org_id and created_at > now() - interval '1 day') >= 50 then
    raise exception 'invite limit reached' using errcode = 'P0001';
  end if;

  insert into public.org_invites (org_id, email, role, token_hash, invited_by)
  values (p_org_id, lower(btrim(p_email)), p_role, private.sha256_hex(v_token), auth.uid());
  return v_token;
end;
$$;

create function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(auth.jwt() ->> 'email');
  v_invite public.org_invites;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_invite
    from public.org_invites
   where token_hash = private.sha256_hex(p_token)
   for update;

  if v_invite.id is null or v_invite.accepted_at is not null or v_invite.expires_at < now() then
    raise exception 'invite is invalid or expired' using errcode = 'P0002';
  end if;
  if v_invite.email <> v_email then
    raise exception 'invite was sent to a different email' using errcode = '42501';
  end if;
  if exists (select 1 from public.organizations where id = v_invite.org_id and suspended_at is not null) then
    raise exception 'organization is suspended' using errcode = '42501';
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (v_invite.org_id, v_uid, v_invite.role)
  on conflict (org_id, user_id) do nothing;
  update public.org_invites set accepted_at = now() where id = v_invite.id;
  return v_invite.org_id;
end;
$$;

create function public.remove_org_member(p_org_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_role text;
begin
  if p_org_id not in (select private.my_admin_org_ids()) and p_user_id is distinct from auth.uid() then
    raise exception 'not an admin of this organization' using errcode = '42501';
  end if;
  select role into v_target_role from public.org_members where org_id = p_org_id and user_id = p_user_id for update;
  if v_target_role is null then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  if v_target_role = 'owner' then
    if not exists (select 1 from public.org_members
                    where org_id = p_org_id and user_id = auth.uid() and role = 'owner') then
      raise exception 'only owners can remove owners' using errcode = '42501';
    end if;
    if (select count(*) from public.org_members where org_id = p_org_id and role = 'owner') = 1 then
      raise exception 'an organization needs at least one owner' using errcode = 'P0001';
    end if;
  end if;
  delete from public.org_members where org_id = p_org_id and user_id = p_user_id;
end;
$$;

create function public.publish_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where id = p_event_id and deleted_at is null for update;
  if v_event.id is null or v_event.org_id not in (select private.my_org_ids()) then
    raise exception 'event not found' using errcode = '42501';
  end if;
  if v_event.status = 'archived' then
    raise exception 'archived events cannot be republished' using errcode = 'P0001';
  end if;
  if v_event.join_mode = 'code'
     and (select join_code_hash from public.event_secrets where event_id = p_event_id) is null then
    raise exception 'generate a join code before publishing' using errcode = 'P0001';
  end if;

  update public.events
     set status = 'published', published_at = coalesce(published_at, now())
   where id = p_event_id;
end;
$$;

create function public.unpublish_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Back to draft hides the page; the slug stays locked because published_at is kept.
  update public.events set status = 'draft'
   where id = p_event_id and status = 'published'
     and org_id in (select private.my_org_ids()) and deleted_at is null;
  if not found then
    raise exception 'event not found or not published' using errcode = '42501';
  end if;
end;
$$;

create function public.archive_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.events set status = 'archived'
   where id = p_event_id and status <> 'archived'
     and org_id in (select private.my_admin_org_ids()) and deleted_at is null;
  if not found then
    raise exception 'event not found or not permitted' using errcode = '42501';
  end if;
end;
$$;

-- 10 random base32 characters (§4.2); returns the plaintext once, stores only the hash.
-- Rotating invalidates the previous code.
create function public.rotate_join_code(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_code  text := '';
begin
  if p_event_id not in (select private.my_org_event_ids()) then
    raise exception 'event not found' using errcode = '42501';
  end if;
  for i in 0..9 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  update public.event_secrets
     set join_code_hash = private.sha256_hex(v_code), rotated_at = now()
   where event_id = p_event_id;
  return v_code;
end;
$$;

-- Used by join_event() in Phase 2.
create function private.check_join_code(p_event_id uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.join_code_hash = private.sha256_hex(upper(btrim(p_code)))
       from public.event_secrets s where s.event_id = p_event_id),
    false);
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_organization(text, text),
  public.create_invite(uuid, text, text),
  public.accept_invite(text),
  public.remove_org_member(uuid, uuid),
  public.publish_event(uuid),
  public.unpublish_event(uuid),
  public.archive_event(uuid),
  public.rotate_join_code(uuid)
  to authenticated;

-- Helpers used inside authenticated policies.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.my_org_ids(),
  private.my_admin_org_ids(),
  private.my_org_event_ids(),
  private.is_valid_slug(text),
  private.normalize_tag(text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Storage (R8)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('event-assets', 'event-assets', true, 5 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp']),
  ('avatars',      'avatars',      true, 2 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- event-assets/{org_id}/{event_id}/<file>: writable by members of that org, for that org's event.
create policy event_assets_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-assets'
    -- `name` stays outside the subquery: inside it would resolve to events.name.
    and array[(storage.foldername(name))[1], (storage.foldername(name))[2]]
        in (select array[e.org_id::text, e.id::text]
              from public.events e
             where e.id in (select private.my_org_event_ids()))
  );
-- Files are served by public URL; this only governs listing and upsert.
create policy event_assets_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'event-assets'
         and (storage.foldername(name))[2] in (select id::text from private.my_org_event_ids() as e(id)));
create policy event_assets_objects_update on storage.objects
  for update to authenticated
  using (bucket_id = 'event-assets'
         and (storage.foldername(name))[2] in (select id::text from private.my_org_event_ids() as e(id)))
  with check (bucket_id = 'event-assets'
         and (storage.foldername(name))[2] in (select id::text from private.my_org_event_ids() as e(id)));
create policy event_assets_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-assets'
         and (storage.foldername(name))[2] in (select id::text from private.my_org_event_ids() as e(id)));

-- avatars/{user_id}/<file>: owner only.
create policy avatars_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_objects_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Members of the same organization can see each other's base profile (member list).
create policy accounts_select_org_comember on public.accounts
  for select to authenticated
  using (user_id in (select m.user_id from public.org_members m
                      where m.org_id in (select private.my_org_ids())));
