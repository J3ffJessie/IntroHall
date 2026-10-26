-- Phase 2: attendees, per-event profiles, interests, joining.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.attendees (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  user_id      uuid not null references public.accounts (user_id) on delete cascade,
  bio          text not null default '' check (char_length(bio) <= 500),
  looking_for  text not null default '' check (char_length(looking_for) <= 280),
  visibility   text not null default 'visible' check (visibility in ('visible', 'hidden')),
  completed_at timestamptz,
  joined_via   text not null check (joined_via in ('link', 'code')),
  joined_at    timestamptz not null default now(),
  left_at      timestamptz,
  banned_at    timestamptz,
  unique (event_id, user_id)
);
create index attendees_user_id_idx on public.attendees (user_id);

create table public.attendee_interests (
  attendee_id uuid not null references public.attendees (id) on delete cascade,
  tag_id      uuid not null references public.interest_tags (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  primary key (attendee_id, tag_id)
);
create index attendee_interests_tag_attendee_idx on public.attendee_interests (tag_id, attendee_id);
create index attendee_interests_event_id_idx on public.attendee_interests (event_id);

-- Join-code brute-force accounting (§3.2 join_event). No API grants.
create table public.join_attempts (
  id       bigint generated always as identity primary key,
  ip_hash  text,
  user_id  uuid,
  event_id uuid not null references public.events (id) on delete cascade,
  success  boolean not null,
  at       timestamptz not null default now()
);
create index join_attempts_user_failed_idx on public.join_attempts (user_id, at) where not success;
create index join_attempts_ip_failed_idx on public.join_attempts (ip_hash, at) where not success;

-- Server-side secrets (never exposed): salt for hashing client IPs.
create table private.secrets (
  key   text primary key,
  value text not null
);
insert into private.secrets (key, value)
values ('ip_salt', encode(extensions.gen_random_bytes(32), 'hex'));
revoke all on private.secrets from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Events where the caller is a completed, not-left, not-banned attendee (§3.1).
create function private.my_event_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.event_id
    from public.attendees a
    join public.events e on e.id = a.event_id
   where a.user_id = auth.uid()
     and a.completed_at is not null
     and a.left_at is null
     and a.banned_at is null
     and e.deleted_at is null;
$$;

create function private.my_attendee_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id from public.attendees a where a.user_id = auth.uid();
$$;

-- Salted hash of the client IP that PostgREST saw (first X-Forwarded-For hop). Null if unknown.
create function private.request_ip_hash()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when ip is null then null
              else private.sha256_hex(ip || (select value from private.secrets where key = 'ip_salt')) end
    from (select nullif(btrim(split_part(coalesce(
            nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), '') as ip) s;
$$;

create function private.mark_stats_dirty(p_event_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  -- Skips the write (and the row lock) when already dirty; matters during join bursts.
  update public.events set stats_dirty = true where id = p_event_id and not stats_dirty;
$$;

-- Attendee status changes affect match statistics (§4.4).
create function private.attendees_mark_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.visibility is distinct from old.visibility
     or new.completed_at is distinct from old.completed_at
     or new.left_at is distinct from old.left_at
     or new.banned_at is distinct from old.banned_at then
    perform private.mark_stats_dirty(new.event_id);
  end if;
  return null;
end;
$$;

create trigger attendees_mark_dirty
  after insert or update on public.attendees
  for each row execute function private.attendees_mark_dirty();

-- ---------------------------------------------------------------------------
-- Grants and RLS (R3)
-- ---------------------------------------------------------------------------
alter table public.attendees          enable row level security;
alter table public.attendee_interests enable row level security;
alter table public.join_attempts      enable row level security;

revoke all on public.attendees, public.attendee_interests, public.join_attempts from public, anon, authenticated;

-- Own row always; co-attendees when they are completed, visible, and still in the event.
-- (Blocks are added to this filter in Phase 4.)
grant select on public.attendees to authenticated;
grant update (bio, looking_for, visibility) on public.attendees to authenticated;

create policy attendees_select_own on public.attendees
  for select to authenticated using (user_id = (select auth.uid()));
create policy attendees_select_coattendee on public.attendees
  for select to authenticated
  using (event_id in (select private.my_event_ids())
         and visibility = 'visible'
         and completed_at is not null
         and left_at is null
         and banned_at is null);
create policy attendees_update_own on public.attendees
  for update to authenticated
  using (user_id = (select auth.uid()) and left_at is null and banned_at is null)
  with check (user_id = (select auth.uid()));

-- Readable wherever the attendee row is readable (the subquery runs under attendees' RLS).
-- Organizers get no row access here: they see interests only as aggregates (§4.7).
grant select on public.attendee_interests to authenticated;
create policy attendee_interests_select on public.attendee_interests
  for select to authenticated using (attendee_id in (select id from public.attendees));

-- Co-attendees' base profiles (R3).
create policy accounts_select_coattendee on public.accounts
  for select to authenticated
  using (user_id in (select a.user_id from public.attendees a));

-- Archived events stay publicly viewable (read-only "this event has ended" page).
drop policy events_select_public on public.events;
create policy events_select_public on public.events
  for select to anon, authenticated
  using (status in ('published', 'archived') and deleted_at is null and not org_suspended);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Returns a status instead of raising for expected outcomes, so failed code attempts are
-- recorded (an exception would roll the attempt row back).
create function public.join_event(p_slug text, p_code text default null)
returns table (status text, attendee_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_event   public.events;
  v_att     public.attendees;
  v_limit   integer;
  v_ip_hash text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Row lock serializes joins per event so attendee_limit is exact under concurrency.
  select * into v_event from public.events
   where slug = lower(btrim(p_slug)) and deleted_at is null
   for update;
  if v_event.id is null or v_event.org_suspended or v_event.status = 'draft' then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if v_event.status = 'archived' then
    return query select 'closed'::text, null::uuid;
    return;
  end if;

  select * into v_att from public.attendees a where a.event_id = v_event.id and a.user_id = v_uid;
  if v_att.banned_at is not null then
    return query select 'banned'::text, null::uuid;
    return;
  end if;
  if v_att.id is not null and v_att.left_at is null then
    return query select 'already_joined'::text, v_att.id;
    return;
  end if;

  if v_event.join_mode = 'code' then
    v_ip_hash := private.request_ip_hash();
    -- Only failures count: a venue's shared Wi-Fi IP must allow hundreds of honest joins.
    if (select count(*) from public.join_attempts j
         where j.user_id = v_uid and not j.success and j.at > now() - interval '15 minutes') >= 10
       or (v_ip_hash is not null and
           (select count(*) from public.join_attempts j
             where j.ip_hash = v_ip_hash and not j.success and j.at > now() - interval '15 minutes') >= 500) then
      return query select 'rate_limited'::text, null::uuid;
      return;
    end if;
    if p_code is null or not private.check_join_code(v_event.id, p_code) then
      insert into public.join_attempts (ip_hash, user_id, event_id, success)
      values (v_ip_hash, v_uid, v_event.id, false);
      return query select (case when p_code is null then 'code_required' else 'invalid_code' end)::text, null::uuid;
      return;
    end if;
  end if;

  select o.attendee_limit into v_limit from public.organizations o where o.id = v_event.org_id;
  if v_limit is not null and
     (select count(*) from public.attendees a
       where a.event_id = v_event.id and a.left_at is null and a.banned_at is null) >= v_limit then
    return query select 'full'::text, null::uuid;
    return;
  end if;

  if v_att.id is not null then
    -- Rejoining after leaving.
    update public.attendees a
       set left_at = null, joined_at = now(),
           joined_via = case when v_event.join_mode = 'code' then 'code' else 'link' end
     where a.id = v_att.id;
  else
    insert into public.attendees (event_id, user_id, joined_via)
    values (v_event.id, v_uid, case when v_event.join_mode = 'code' then 'code' else 'link' end)
    returning * into v_att;
  end if;

  if v_event.join_mode = 'code' then
    insert into public.join_attempts (ip_hash, user_id, event_id, success)
    values (v_ip_hash, v_uid, v_event.id, true);
  end if;

  return query select 'joined'::text, v_att.id;
end;
$$;

-- Replaces the caller's interests for an event. Official tags by id; custom ones by label
-- (normalized and reused if they exist). 1–10 total; custom count ≤ events.max_custom_interests.
create function public.upsert_interests(p_event_id uuid, p_tag_ids uuid[], p_custom_labels text[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att    public.attendees;
  v_event  public.events;
  v_label  text;
  v_norm   text;
  v_tag    public.interest_tags;
  v_final  uuid[] := '{}';
  v_custom integer := 0;
begin
  select * into v_att from public.attendees a
   where a.event_id = p_event_id and a.user_id = auth.uid() and a.left_at is null and a.banned_at is null
   for update;
  if v_att.id is null then
    raise exception 'not an attendee of this event' using errcode = '42501';
  end if;
  select * into v_event from public.events e where e.id = p_event_id;
  if v_event.status <> 'published' then
    raise exception 'this event is not open for changes' using errcode = 'P0001';
  end if;

  -- Official (or previously created) tags chosen by id; follow merges, skip hidden.
  select coalesce(array_agg(distinct coalesce(t.merged_into, t.id)), '{}') into v_final
    from public.interest_tags t
   where t.id = any(coalesce(p_tag_ids, '{}')) and t.event_id = p_event_id and not t.hidden;
  if cardinality(v_final) <> (select count(distinct x) from unnest(coalesce(p_tag_ids, '{}')) x) then
    raise exception 'one or more interests are not available' using errcode = 'P0001';
  end if;

  if cardinality(coalesce(p_custom_labels, '{}')) > 0 and not v_event.allow_custom_interests then
    raise exception 'this event does not allow custom interests' using errcode = 'P0001';
  end if;

  foreach v_label in array coalesce(p_custom_labels, '{}') loop
    v_label := regexp_replace(btrim(normalize(v_label, NFKC)), '\s+', ' ', 'g');
    continue when v_label = '';
    if char_length(v_label) > 40 then
      raise exception 'interests are at most 40 characters' using errcode = 'P0001';
    end if;
    v_norm := private.normalize_tag(v_label);
    select * into v_tag from public.interest_tags t where t.event_id = p_event_id and t.normalized = v_norm;
    if v_tag.id is null then
      insert into public.interest_tags (event_id, label) values (p_event_id, v_label) returning * into v_tag;
    end if;
    if v_tag.hidden then
      raise exception 'one or more interests are not available' using errcode = 'P0001';
    end if;
    v_final := array_append(v_final, coalesce(v_tag.merged_into, v_tag.id));
  end loop;

  select coalesce(array_agg(distinct x), '{}') into v_final from unnest(v_final) x;
  if cardinality(v_final) < 1 then
    raise exception 'pick at least one interest' using errcode = 'P0001';
  end if;
  if cardinality(v_final) > 10 then
    raise exception 'pick at most 10 interests' using errcode = 'P0001';
  end if;
  select count(*) into v_custom from public.interest_tags t where t.id = any(v_final) and not t.is_official;
  if v_custom > v_event.max_custom_interests then
    raise exception 'too many custom interests (max %)', v_event.max_custom_interests using errcode = 'P0001';
  end if;

  delete from public.attendee_interests ai where ai.attendee_id = v_att.id and ai.tag_id <> all(v_final);
  insert into public.attendee_interests (attendee_id, tag_id, event_id)
  select v_att.id, x, p_event_id from unnest(v_final) x
  on conflict do nothing;

  update public.attendees a set completed_at = coalesce(a.completed_at, now()) where a.id = v_att.id;
  perform private.mark_stats_dirty(p_event_id);
end;
$$;

create function public.leave_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Phase 4 adds: withdraw pending requests, make conversations read-only.
  update public.attendees a set left_at = now()
   where a.event_id = p_event_id and a.user_id = auth.uid() and a.left_at is null;
  if not found then
    raise exception 'not an attendee of this event' using errcode = '42501';
  end if;
end;
$$;

-- Organizer moderation: remove (and optionally ban) an attendee. Same effects as leaving.
create function public.remove_attendee(p_attendee_id uuid, p_ban boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.attendees a
     set left_at = coalesce(a.left_at, now()),
         banned_at = case when p_ban then coalesce(a.banned_at, now()) else a.banned_at end
   where a.id = p_attendee_id
     and a.event_id in (select private.my_org_event_ids());
  if not found then
    raise exception 'attendee not found' using errcode = '42501';
  end if;
end;
$$;

create function public.unban_attendee(p_attendee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.attendees a set banned_at = null
   where a.id = p_attendee_id and a.event_id in (select private.my_org_event_ids());
  if not found then
    raise exception 'attendee not found' using errcode = '42501';
  end if;
end;
$$;

-- R4 organizer roster. A function rather than a view: any view or policy that let organizers
-- read `attendees` rows would also expose bios. Interests are never included (§4.7).
create function public.get_event_roster(p_event_id uuid)
returns table (
  attendee_id  uuid,
  full_name    text,
  headline     text,
  company      text,
  joined_via   text,
  joined_at    timestamptz,
  completed_at timestamptz,
  left_at      timestamptz,
  banned_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_event_id not in (select private.my_org_event_ids()) then
    raise exception 'event not found' using errcode = '42501';
  end if;
  return query
    select a.id, ac.full_name, ac.headline, ac.company, a.joined_via, a.joined_at,
           a.completed_at, a.left_at, a.banned_at
      from public.attendees a
      join public.accounts ac on ac.user_id = a.user_id
     where a.event_id = p_event_id
     order by a.joined_at desc;
end;
$$;

revoke execute on function
  public.join_event(text, text),
  public.upsert_interests(uuid, uuid[], text[]),
  public.leave_event(uuid),
  public.remove_attendee(uuid, boolean),
  public.unban_attendee(uuid),
  public.get_event_roster(uuid)
  from public, anon;
grant execute on function
  public.join_event(text, text),
  public.upsert_interests(uuid, uuid[], text[]),
  public.leave_event(uuid),
  public.remove_attendee(uuid, boolean),
  public.unban_attendee(uuid),
  public.get_event_roster(uuid)
  to authenticated;

revoke execute on function
  private.my_event_ids(), private.my_attendee_ids(), private.request_ip_hash(),
  private.mark_stats_dirty(uuid), private.attendees_mark_dirty()
  from public, anon, authenticated;
grant execute on function private.my_event_ids(), private.my_attendee_ids() to authenticated;
