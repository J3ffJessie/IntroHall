-- Announcements targeted at an interest: an organizer can post to "everyone interested in Rust"
-- instead of the whole event. Targeted posts are visible to organizers and to active attendees who
-- picked that interest; they never appear on the public event page, and only those attendees get
-- the push. Untargeted posts behave exactly as before.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- Nullable, no default: no table rewrite. Tags are only removed with their event (organizers hide
-- or merge them instead), so cascade never removes a post on its own. The new column is all NULL,
-- so checking the foreign key scans nothing.
-- squawk-ignore adding-foreign-key-constraint
alter table public.announcements add column target_tag_id uuid references public.interest_tags (id) on delete cascade;
-- squawk-ignore require-concurrent-index-creation
create index announcements_target_tag_idx on public.announcements (target_tag_id) where target_tag_id is not null;

-- Chosen when the post is written; not editable afterwards (the push may already have gone out).
grant insert (target_tag_id) on public.announcements to authenticated;

-- The interest must belong to the same event.
create function private.announcements_target_valid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_tag_id is not null and not exists (
       select 1 from public.interest_tags t where t.id = new.target_tag_id and t.event_id = new.event_id) then
    raise exception 'that interest is not part of this event' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger announcements_target_valid
  before insert or update of target_tag_id, event_id on public.announcements
  for each row execute function private.announcements_target_valid();

-- Merging "rustlang" into "Rust" moves everyone's interest to "Rust"; posts aimed at "rustlang"
-- follow, so they keep reaching the same people.
create function private.interest_tags_merge_announcements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.announcements set target_tag_id = new.merged_into where target_tag_id = new.id;
  return null;
end;
$$;

create trigger interest_tags_merge_announcements
  after update of merged_into on public.interest_tags
  for each row when (new.merged_into is not null and new.merged_into is distinct from old.merged_into)
  execute function private.interest_tags_merge_announcements();

-- Interests the caller picked, across events where they are an active attendee.
create function private.my_interest_tag_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ai.tag_id
    from public.attendee_interests ai
    join public.attendees a on a.id = ai.attendee_id
   where a.user_id = auth.uid()
     and a.completed_at is not null and a.left_at is null and a.banned_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Reading: the public policy now covers untargeted posts only; targeted ones need the interest.
-- (Organizers keep announcements_select_org.)
-- ---------------------------------------------------------------------------
drop policy announcements_select_published on public.announcements;
create policy announcements_select_published on public.announcements
  for select to anon, authenticated
  using (published_at is not null and target_tag_id is null and event_id in (select id from public.events));
create policy announcements_select_targeted on public.announcements
  for select to authenticated
  using (published_at is not null and target_tag_id in (select private.my_interest_tag_ids()));

-- ---------------------------------------------------------------------------
-- Push: jobs may carry a tag_id; the worker then sends only to attendees with that interest.
-- ---------------------------------------------------------------------------
-- Adds a defaulted parameter, so existing 7-argument callers (request and message triggers)
-- resolve to the new function; plpgsql looks it up at run time.
-- squawk-ignore ban-drop-function
drop function private.enqueue_push(text, uuid, uuid, text, text, text, text);

create function private.enqueue_push(p_kind text, p_event_id uuid, p_user_id uuid, p_title text, p_body text,
                                     p_url text, p_tag text, p_tag_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Skip jobs nobody would receive.
  if not exists (
    select 1 from public.push_subscription_events pse
      join public.push_subscriptions s on s.id = pse.subscription_id
     where pse.event_id = p_event_id and (p_user_id is null or s.user_id = p_user_id)
       and (p_tag_id is null or exists (
             select 1 from public.attendees a
               join public.attendee_interests ai on ai.attendee_id = a.id and ai.tag_id = p_tag_id
              where a.event_id = p_event_id and a.user_id = s.user_id))
  ) then
    return;
  end if;
  perform pgmq.send('push_jobs', jsonb_build_object(
    'kind', p_kind, 'event_id', p_event_id, 'user_id', p_user_id, 'tag_id', p_tag_id,
    'title', left(p_title, 120), 'body', left(coalesce(p_body, ''), 200),
    'url', p_url, 'tag', p_tag, 'after_subscription_id', null));
end;
$$;

-- Same claim as before, passing each post's target along.
create or replace function private.claim_announcements(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with claimed as (
    update public.announcements a
       set published_at = now(), push_enqueued_at = now()
     where a.published_at is null
       and (case when p_ids is null then a.publish_at is not null and a.publish_at <= now()
                 else a.id = any(p_ids) end)
       and exists (select 1 from public.events e where e.id = a.event_id and e.status = 'published' and e.deleted_at is null)
    returning a.id, a.event_id, a.title, a.body, a.target_tag_id
  ),
  pushed as (
    select c.id, private.enqueue_push('announcement', c.event_id, null, c.title, c.body, '/home',
                                      'announcement-' || c.id, c.target_tag_id)
      from claimed c
  ),
  broadcast as (
    select realtime.send(jsonb_build_object('id', c.id), 'announcement', 'event:' || c.event_id::text, true)
      from claimed c
  )
  select (select count(*) from pushed) + 0 * (select count(*) from broadcast) into v_count;
  return v_count;
end;
$$;

revoke execute on function private.announcements_target_valid(), private.interest_tags_merge_announcements(),
                          private.my_interest_tag_ids(),
                          private.enqueue_push(text, uuid, uuid, text, text, text, text, uuid),
                          private.claim_announcements(uuid[])
  from public, anon, authenticated;
-- Used by announcements_select_targeted, which runs as the caller.
grant execute on function private.my_interest_tag_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Composer: the interests an organizer can aim at, with how many active attendees each reaches.
-- Totals only, like analytics. Hidden and merged interests are left out.
-- ---------------------------------------------------------------------------
create function public.get_announcement_audiences(p_event_id uuid)
returns table (tag_id uuid, label text, attendees integer)
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
  select t.id, t.label, count(a.id)::integer
    from public.interest_tags t
    left join public.attendee_interests ai on ai.tag_id = t.id
    left join public.attendees a on a.id = ai.attendee_id
          and a.completed_at is not null and a.left_at is null and a.banned_at is null
   where t.event_id = p_event_id and not t.hidden and t.merged_into is null
   group by t.id, t.label
   order by count(a.id) desc, t.label;
end;
$$;

revoke all on function public.get_announcement_audiences(uuid) from public, anon;
grant execute on function public.get_announcement_audiences(uuid) to authenticated;
