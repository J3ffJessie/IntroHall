-- Phase 6 (v1): full moderation (tag merge, hidden tags out of matching, platform admins),
-- organizer analytics (§4.7), data export + automated account deletion (§3.3), auto-archive,
-- event and organization deletion with a 30-day purge.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Platform admins. Granted by SQL only (README: "Platform admins"); no API access to the table.
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id    uuid primary key,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;

create function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Organization soft delete. Deleted orgs drop out of every membership helper at once.
-- ---------------------------------------------------------------------------
alter table public.organizations add column deleted_at timestamptz;

create or replace function private.my_org_ids()
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
     and o.suspended_at is null
     and o.deleted_at is null;
$$;

create or replace function private.my_admin_org_ids()
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
     and o.suspended_at is null
     and o.deleted_at is null;
$$;

-- Deleted orgs no longer count toward the 5-owned-organizations limit.
create or replace function public.create_organization(p_name text, p_slug text)
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
  if (select count(*) from public.org_members m join public.organizations o on o.id = m.org_id
       where m.user_id = v_uid and m.role = 'owner' and o.deleted_at is null) >= 5 then
    raise exception 'organization limit reached' using errcode = 'P0001';
  end if;

  insert into public.organizations (name, slug) values (btrim(p_name), lower(btrim(p_slug)))
  returning id into v_org;
  insert into public.org_members (org_id, user_id, role) values (v_org, v_uid, 'owner');
  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conversations get a read-only reason for a partner who deleted their account.
-- ---------------------------------------------------------------------------
-- squawk-ignore ban-drop-constraint
alter table public.conversations drop constraint conversations_read_only_reason_check;
-- squawk-ignore constraint-missing-not-valid
alter table public.conversations add constraint conversations_read_only_reason_check
  check (read_only_reason in ('blocked', 'left', 'event_closed', 'account_deleted'));

-- ---------------------------------------------------------------------------
-- Tag moderation
-- ---------------------------------------------------------------------------

-- Moves every holder of p_from onto p_into, then leaves p_from as an alias (merged_into) so a
-- custom label typed later still lands on p_into (upsert_interests follows merged_into).
create function public.merge_tags(p_from uuid, p_into uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.interest_tags;
  v_into public.interest_tags;
begin
  select * into v_from from public.interest_tags where id = p_from for update;
  select * into v_into from public.interest_tags where id = p_into for update;
  if v_from.id is null or v_into.id is null or v_from.event_id not in (select private.my_org_event_ids()) then
    raise exception 'interest not found' using errcode = '42501';
  end if;
  if v_from.event_id <> v_into.event_id then
    raise exception 'interests belong to different events' using errcode = 'P0001';
  end if;
  if v_from.id = v_into.id then
    raise exception 'pick two different interests' using errcode = 'P0001';
  end if;
  if v_from.merged_into is not null or v_into.merged_into is not null then
    raise exception 'that interest was already merged' using errcode = 'P0001';
  end if;
  if v_into.hidden then
    raise exception 'show the interest you are merging into first' using errcode = 'P0001';
  end if;
  if (select e.status from public.events e where e.id = v_from.event_id) = 'archived' then
    raise exception 'archived events are read-only' using errcode = 'P0001';
  end if;

  insert into public.attendee_interests (attendee_id, tag_id, event_id)
  select ai.attendee_id, p_into, ai.event_id from public.attendee_interests ai where ai.tag_id = p_from
  on conflict do nothing;
  delete from public.attendee_interests where tag_id = p_from;
  update public.interest_tags set merged_into = p_into where id = p_from;
  perform private.mark_stats_dirty(v_from.event_id);
end;
$$;

-- Hidden tags no longer count toward scores or show as shared chips (replaces the Phase 4
-- definition; only the two `interest_tags ... not hidden` joins are new).
create or replace function public.get_matches(
  p_event_id uuid,
  p_mode     text default 'matches',
  p_tag      uuid default null,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns table (
  attendee_id  uuid,
  full_name    text,
  headline     text,
  company      text,
  avatar_path  text,
  bio          text,
  looking_for  text,
  shared_tags  text[],
  score        double precision,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me      uuid;
  v_n       double precision;
  v_limit   integer := least(greatest(p_limit, 1), 100);
  v_offset  integer := greatest(p_offset, 0);
  v_blocked uuid[];
begin
  if p_mode not in ('matches', 'everyone') then
    raise exception 'invalid mode' using errcode = '22023';
  end if;
  v_me := private.my_active_attendee(p_event_id);
  if v_me is null then
    raise exception 'not an attendee of this event' using errcode = '42501';
  end if;
  v_n := greatest(coalesce((select s.n from public.event_stats s where s.event_id = p_event_id), 1), 1);
  v_blocked := coalesce((select array_agg(b) from private.my_blocked_attendee_ids() b), '{}');

  -- Performance: score with tag ids only, rank, and only then fetch names and labels for the
  -- page being returned. Eligibility always comes from live tables.
  if p_mode = 'matches' then
    return query
    with weights as (
      select mi.tag_id, ln(1 + v_n / coalesce(st.count, 1)::double precision) as w
        from public.attendee_interests mi
        join public.interest_tags mt on mt.id = mi.tag_id and not mt.hidden
        left join public.event_tag_stats st on st.event_id = p_event_id and st.tag_id = mi.tag_id
       where mi.attendee_id = v_me
    ),
    scores as (
      select x.attendee_id as id, sum(w.w) as score
        from public.attendee_interests x
        join weights w on w.tag_id = x.tag_id
       where x.attendee_id <> v_me
       group by x.attendee_id
    ),
    page as (
      select a.id, a.user_id, a.bio, a.looking_for, a.completed_at, s.score
        from scores s
        join public.attendees a on a.id = s.id
       where a.completed_at is not null and a.visibility = 'visible' and a.left_at is null and a.banned_at is null
         and a.id <> all(v_blocked)
         and (p_tag is null or exists (select 1 from public.attendee_interests f
                                        where f.attendee_id = a.id and f.tag_id = p_tag))
       order by s.score desc, a.completed_at desc, a.id
       limit v_limit offset v_offset
    )
    select p.id, ac.full_name, ac.headline, ac.company, ac.avatar_path, p.bio, p.looking_for,
           (select array_agg(t.label order by t.label)
              from public.attendee_interests y
              join weights w on w.tag_id = y.tag_id
              join public.interest_tags t on t.id = y.tag_id
             where y.attendee_id = p.id),
           p.score, p.completed_at
      from page p
      join public.accounts ac on ac.user_id = p.user_id
     order by p.score desc, p.completed_at desc, p.id;
  else
    return query
    with page as (
      select a.id, a.user_id, a.bio, a.looking_for, a.completed_at
        from public.attendees a
       where a.event_id = p_event_id and a.id <> v_me
         and a.completed_at is not null and a.visibility = 'visible' and a.left_at is null and a.banned_at is null
         and a.id <> all(v_blocked)
         and not exists (select 1 from public.attendee_interests x
                          join public.attendee_interests mi on mi.tag_id = x.tag_id and mi.attendee_id = v_me
                          join public.interest_tags mt on mt.id = mi.tag_id and not mt.hidden
                         where x.attendee_id = a.id)
         and (p_tag is null or exists (select 1 from public.attendee_interests f
                                        where f.attendee_id = a.id and f.tag_id = p_tag))
       order by a.completed_at desc, a.id
       limit v_limit offset v_offset
    )
    select p.id, ac.full_name, ac.headline, ac.company, ac.avatar_path, p.bio, p.looking_for,
           '{}'::text[], 0::double precision, p.completed_at
      from page p
      join public.accounts ac on ac.user_id = p.user_id
     order by p.completed_at desc, p.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform admin moderation
-- ---------------------------------------------------------------------------
create function public.am_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin();
$$;

create function public.admin_list_orgs(p_search text default '')
returns table (
  org_id       uuid,
  name         text,
  slug         text,
  created_at   timestamptz,
  suspended_at timestamptz,
  deleted_at   timestamptz,
  members      integer,
  events       integer,
  owners       text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  return query
    select o.id, o.name, o.slug, o.created_at, o.suspended_at, o.deleted_at,
           (select count(*)::integer from public.org_members m where m.org_id = o.id),
           (select count(*)::integer from public.events e where e.org_id = o.id and e.deleted_at is null),
           (select array_agg(u.email::text order by u.email) from public.org_members m
              join auth.users u on u.id = m.user_id where m.org_id = o.id and m.role = 'owner')
      from public.organizations o
     where coalesce(btrim(p_search), '') = ''
        or o.name ilike '%' || btrim(p_search) || '%'
        or o.slug ilike '%' || btrim(p_search) || '%'
     order by o.created_at desc
     limit 50;
end;
$$;

-- Suspending hides the org's events (events.org_suspended) and locks its members out of it.
-- Returns the event slugs so the app can refresh their cached public pages.
create function public.admin_set_org_suspended(p_org_id uuid, p_suspended boolean)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  update public.organizations
     set suspended_at = case when p_suspended then coalesce(suspended_at, now()) end
   where id = p_org_id;
  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
  return coalesce((select array_agg(e.slug) from public.events e where e.org_id = p_org_id), '{}');
end;
$$;

create function public.admin_find_users(p_email text)
returns table (
  user_id      uuid,
  email        text,
  full_name    text,
  created_at   timestamptz,
  suspended    boolean,
  events       integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_email, ''))) < 3 then
    return;
  end if;
  return query
    select u.id, u.email::text, coalesce(ac.full_name, ''), u.created_at,
           coalesce(u.banned_until > now(), false),
           (select count(*)::integer from public.attendees a where a.user_id = u.id)
      from auth.users u
      left join public.accounts ac on ac.user_id = u.id
     where u.email ilike '%' || btrim(p_email) || '%'
     order by u.email
     limit 20;
end;
$$;

-- Suspending a person: no sign-in (Auth ban), every session revoked, and removed + banned from
-- every event they joined (the attendees lifecycle trigger withdraws requests and freezes chats).
-- Access tokens already issued stay valid until they expire (at most 1 hour).
-- Unsuspending restores sign-in only; organizers lift event bans themselves.
create function public.admin_set_user_suspended(p_user_id uuid, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'you cannot suspend yourself' using errcode = 'P0001';
  end if;
  update auth.users
     set banned_until = case when p_suspended then 'infinity'::timestamptz end
   where id = p_user_id;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if p_suspended then
    delete from auth.sessions where user_id = p_user_id;
    update public.attendees
       set left_at = coalesce(left_at, now()), banned_at = now()
     where user_id = p_user_id and banned_at is null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizer analytics (§4.7): aggregates only, never per-attendee activity.
-- ---------------------------------------------------------------------------
create function public.get_event_analytics(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  if p_event_id not in (select private.my_org_event_ids()) then
    raise exception 'event not found' using errcode = '42501';
  end if;
  select e.timezone into v_tz from public.events e where e.id = p_event_id;

  return (
    with att as (
      select a.joined_at, a.completed_at, a.left_at, a.banned_at
        from public.attendees a where a.event_id = p_event_id
    ),
    req as (
      select r.status from public.connection_requests r where r.event_id = p_event_id
    )
    select jsonb_build_object(
      'joined',            (select count(*) from att),
      'completed',         (select count(*) from att where completed_at is not null),
      'active',            (select count(*) from att where completed_at is not null and left_at is null and banned_at is null),
      'left',              (select count(*) from att where left_at is not null and banned_at is null),
      'removed',           (select count(*) from att where banned_at is not null),
      'requests_sent',     (select count(*) from req),
      'requests_accepted', (select count(*) from req where status = 'accepted'),
      -- last_message_at survives message retention, so this count does not shrink later.
      'conversations_started',
        (select count(*) from public.conversations c where c.event_id = p_event_id and c.last_message_at is not null),
      -- Local wall-clock hours in the event's time zone.
      'joins_by_hour', coalesce((
        select jsonb_agg(jsonb_build_object('hour', h, 'joins', n) order by h)
          from (select to_char(date_trunc('hour', joined_at at time zone v_tz), 'YYYY-MM-DD"T"HH24:00') as h,
                       count(*) as n
                  from att group by 1) s), '[]'::jsonb),
      'top_tags', coalesce((
        select jsonb_agg(jsonb_build_object('label', label, 'attendees', n, 'hidden', hidden) order by n desc, label)
          from (select t.label, t.hidden, count(*) as n
                  from public.attendee_interests ai
                  join public.attendees a on a.id = ai.attendee_id
                  join public.interest_tags t on t.id = ai.tag_id
                 where ai.event_id = p_event_id
                   and a.completed_at is not null and a.left_at is null and a.banned_at is null
                 group by t.id, t.label, t.hidden
                 order by count(*) desc, t.label
                 limit 10) s), '[]'::jsonb)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Data export (GDPR access): the caller's own rows. Outgoing declined requests are exported as
-- pending, matching what the app shows (declines are silent, §3.2).
-- ---------------------------------------------------------------------------
create function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_mine uuid[];
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_mine := coalesce((select array_agg(a.id) from public.attendees a where a.user_id = v_uid), '{}');

  return jsonb_build_object(
    'exported_at', now(),
    'user_id', v_uid,
    'email', (select u.email from auth.users u where u.id = v_uid),
    'account', (select to_jsonb(ac) - 'deleted_at' from public.accounts ac where ac.user_id = v_uid),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name, 'role', m.role, 'member_since', m.created_at))
        from public.org_members m join public.organizations o on o.id = m.org_id
       where m.user_id = v_uid), '[]'::jsonb),
    'attendees', coalesce((
      select jsonb_agg(to_jsonb(a) || jsonb_build_object('event_name', e.name, 'event_slug', e.slug) order by a.joined_at)
        from public.attendees a join public.events e on e.id = a.event_id
       where a.id = any(v_mine)), '[]'::jsonb),
    'attendee_interests', coalesce((
      select jsonb_agg(jsonb_build_object('attendee_id', ai.attendee_id, 'event_id', ai.event_id,
                                          'tag_id', ai.tag_id, 'label', t.label))
        from public.attendee_interests ai join public.interest_tags t on t.id = ai.tag_id
       where ai.attendee_id = any(v_mine)), '[]'::jsonb),
    'connection_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'event_id', r.event_id,
               'direction', case when r.from_attendee = any(v_mine) then 'outgoing' else 'incoming' end,
               'other_attendee', case when r.from_attendee = any(v_mine) then r.to_attendee else r.from_attendee end,
               'other_name', oac.full_name,
               'note', r.note,
               'status', case when r.from_attendee = any(v_mine) and r.status = 'declined' then 'pending' else r.status end,
               'created_at', r.created_at,
               'responded_at', case when r.from_attendee = any(v_mine) and r.status = 'declined' then null else r.responded_at end)
             order by r.created_at)
        from public.connection_requests r
        join public.attendees o on o.id = case when r.from_attendee = any(v_mine) then r.to_attendee else r.from_attendee end
        left join public.accounts oac on oac.user_id = o.user_id
       where r.from_attendee = any(v_mine) or r.to_attendee = any(v_mine)), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'conversation_id', m.conversation_id, 'body', m.body,
                                          'created_at', m.created_at) order by m.created_at)
        from public.messages m where m.sender_attendee = any(v_mine)), '[]'::jsonb),
    'push_subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'user_agent', s.user_agent,
                                          'created_at', s.created_at, 'last_success_at', s.last_success_at,
                                          'event_ids', (select coalesce(array_agg(pe.event_id), '{}')
                                                          from public.push_subscription_events pe
                                                         where pe.subscription_id = s.id)))
        from public.push_subscriptions s where s.user_id = v_uid), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', b.event_id, 'blocker_attendee', b.blocker_attendee,
                                          'blocked_attendee', b.blocked_attendee, 'created_at', b.created_at))
        from public.blocks b where b.blocker_attendee = any(v_mine)), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'event_id', r.event_id, 'target_attendee', r.target_attendee,
                                          'reason', r.reason, 'status', r.status, 'reported_at', r.reported_at,
                                          'resolved_at', r.resolved_at) order by r.reported_at)
        from public.reports r where r.reporter = any(v_mine)), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion (§3.3), step 1 of the delete-account Edge Function. Storage objects and the
-- auth.users row are removed by the function afterwards (Storage API / Auth admin API).
-- ---------------------------------------------------------------------------

-- Organizations the caller is the only owner of: they must be deleted first.
create function public.account_deletion_blockers()
returns table (org_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name
    from public.org_members m
    join public.organizations o on o.id = m.org_id
   where m.user_id = auth.uid() and m.role = 'owner' and o.deleted_at is null
     and not exists (select 1 from public.org_members m2
                      where m2.org_id = m.org_id and m2.role = 'owner' and m2.user_id <> m.user_id)
   order by o.name;
$$;

create function public.delete_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mine uuid[] := coalesce((select array_agg(a.id) from public.attendees a where a.user_id = p_user_id), '{}');
begin
  if exists (select 1
               from public.org_members m
               join public.organizations o on o.id = m.org_id
              where m.user_id = p_user_id and m.role = 'owner' and o.deleted_at is null
                and not exists (select 1 from public.org_members m2
                                 where m2.org_id = m.org_id and m2.role = 'owner' and m2.user_id <> p_user_id)) then
    raise exception 'delete the organizations you own first' using errcode = 'P0001';
  end if;

  -- Before the attendee rows go: afterwards the conversations only hold NULLs.
  update public.conversations set read_only_reason = 'account_deleted'
   where attendee_lo = any(v_mine) or attendee_hi = any(v_mine);
  perform private.mark_stats_dirty(e.event_id)
     from (select distinct a.event_id from public.attendees a where a.id = any(v_mine)) e;

  -- Cascades interests, requests, blocks, participants; SET NULL on messages, conversations, reports.
  delete from public.attendees where id = any(v_mine);
  delete from public.push_subscriptions where user_id = p_user_id;
  delete from public.org_members where user_id = p_user_id;
  delete from public.platform_admins where user_id = p_user_id;
  delete from public.join_attempts where user_id = p_user_id;
  update public.org_invites set invited_by = null where invited_by = p_user_id;
  update public.interest_tags set created_by = null where created_by = p_user_id;
  update public.announcements set author_user = null where author_user = p_user_id;
  update public.reports set resolved_by = null where resolved_by = p_user_id;

  update public.accounts
     set full_name = 'Deleted user', headline = '', company = '', links = '[]'::jsonb, avatar_path = null,
         deleted_at = coalesce(deleted_at, now())
   where user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Event and organization deletion: soft delete now, hard delete + storage purge after 30 days
-- (purge-events Edge Function, kicked daily by cron). Events can be restored until then.
-- ---------------------------------------------------------------------------
create function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.events set deleted_at = now()
   where id = p_event_id and deleted_at is null and org_id in (select private.my_admin_org_ids());
  if not found then
    raise exception 'event not found or not permitted' using errcode = '42501';
  end if;
end;
$$;

create function public.restore_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.events set deleted_at = null
   where id = p_event_id and deleted_at > now() - interval '30 days'
     and org_id in (select private.my_admin_org_ids());
  if not found then
    raise exception 'event not found or no longer restorable' using errcode = '42501';
  end if;
end;
$$;

create function public.get_deleted_events(p_org_id uuid)
returns table (event_id uuid, name text, slug text, deleted_at timestamptz, purge_after timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_org_id not in (select private.my_admin_org_ids()) then
    raise exception 'not an admin of this organization' using errcode = '42501';
  end if;
  return query
    select e.id, e.name, e.slug, e.deleted_at, e.deleted_at + interval '30 days'
      from public.events e
     where e.org_id = p_org_id and e.deleted_at is not null
     order by e.deleted_at desc;
end;
$$;

-- Owners only. Every event goes with it; members lose access immediately.
create function public.delete_organization(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.org_members m join public.organizations o on o.id = m.org_id
                  where m.org_id = p_org_id and m.user_id = auth.uid() and m.role = 'owner'
                    and o.deleted_at is null) then
    raise exception 'only owners can delete an organization' using errcode = '42501';
  end if;
  update public.organizations set deleted_at = now() where id = p_org_id;
  update public.events set deleted_at = now() where org_id = p_org_id and deleted_at is null;
  delete from public.org_invites where org_id = p_org_id and accepted_at is null;
end;
$$;

-- Service role only (purge-events): events past the 30-day window, with their storage prefix.
create function public.purge_targets()
returns table (event_id uuid, org_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.org_id from public.events e
   where e.deleted_at < now() - interval '30 days'
   order by e.deleted_at
   limit 100;
$$;

-- Service role only: hard delete after its storage objects are gone. Cascades everything.
create function public.purge_event(p_event_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.events where id = p_event_id and deleted_at < now() - interval '30 days';
$$;

-- Service role only: deleted organizations whose events have all been purged.
create function public.purge_deleted_orgs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.organizations o
   where o.deleted_at < now() - interval '30 days'
     and not exists (select 1 from public.events e where e.org_id = o.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Daily: call purge-events only when something is due (same pattern as kick_push_worker).
create function private.kick_purge_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select value from private.secrets where key = 'purge_worker_url');
  v_key text := (select value from private.secrets where key = 'service_role_key');
begin
  if v_url is null or v_key is null then
    return;
  end if;
  if exists (select 1 from public.events where deleted_at < now() - interval '30 days')
     or exists (select 1 from public.organizations where deleted_at < now() - interval '30 days') then
    perform net.http_post(url := v_url, headers := jsonb_build_object('Authorization', 'Bearer ' || v_key,
                                                                       'Content-Type', 'application/json'),
                          body := '{}'::jsonb, timeout_milliseconds := 60000);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auto-archive (§3.3): published events become read-only 14 days after they end.
-- ---------------------------------------------------------------------------
create function private.auto_archive_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.events set status = 'archived'
   where status = 'published' and deleted_at is null and ends_at < now() - interval '14 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

select cron.schedule('auto-archive-events', '23 * * * *', $$select private.auto_archive_events()$$);
select cron.schedule('purge-deleted-events', '41 4 * * *', $$select private.kick_purge_worker()$$);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  public.merge_tags(uuid, uuid), public.am_platform_admin(), public.admin_list_orgs(text),
  public.admin_set_org_suspended(uuid, boolean), public.admin_find_users(text),
  public.admin_set_user_suspended(uuid, boolean), public.get_event_analytics(uuid), public.export_my_data(),
  public.account_deletion_blockers(), public.delete_account_data(uuid), public.delete_event(uuid),
  public.restore_event(uuid), public.get_deleted_events(uuid), public.delete_organization(uuid),
  public.purge_targets(), public.purge_event(uuid), public.purge_deleted_orgs()
  from public, anon, authenticated;
grant execute on function
  public.merge_tags(uuid, uuid), public.am_platform_admin(), public.admin_list_orgs(text),
  public.admin_set_org_suspended(uuid, boolean), public.admin_find_users(text),
  public.admin_set_user_suspended(uuid, boolean), public.get_event_analytics(uuid), public.export_my_data(),
  public.account_deletion_blockers(), public.delete_event(uuid), public.restore_event(uuid),
  public.get_deleted_events(uuid), public.delete_organization(uuid)
  to authenticated;
-- Edge Functions only.
grant execute on function
  public.delete_account_data(uuid), public.purge_targets(), public.purge_event(uuid), public.purge_deleted_orgs()
  to service_role;

revoke execute on function
  private.is_platform_admin(), private.kick_purge_worker(), private.auto_archive_events()
  from public, anon, authenticated;
