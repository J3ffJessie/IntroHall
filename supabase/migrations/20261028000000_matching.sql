-- Phase 3: match statistics and ranking (§4.4).

set lock_timeout = '5s';
set statement_timeout = '60s';

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Statistics: how many eligible attendees hold each tag, and how many there are.
-- Eligible = completed, visible, not left, not banned. Rebuilt for dirty events by cron.
-- Stale stats only change ranking; who is visible is always decided from live tables.
-- ---------------------------------------------------------------------------
create table public.event_stats (
  event_id   uuid primary key references public.events (id) on delete cascade,
  n          integer not null,
  rebuilt_at timestamptz not null default now()
);

create table public.event_tag_stats (
  event_id uuid not null references public.events (id) on delete cascade,
  tag_id   uuid not null references public.interest_tags (id) on delete cascade,
  count    integer not null,
  primary key (event_id, tag_id)
);

alter table public.event_stats enable row level security;
alter table public.event_tag_stats enable row level security;
-- Read only through get_matches() / analytics RPCs.
revoke all on public.event_stats, public.event_tag_stats from public, anon, authenticated;

create function private.rebuild_event_stats(p_event_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.event_tag_stats where event_id = any(p_event_ids);

  insert into public.event_tag_stats (event_id, tag_id, count)
  select ai.event_id, ai.tag_id, count(*)
    from public.attendee_interests ai
    join public.attendees a on a.id = ai.attendee_id
   where ai.event_id = any(p_event_ids)
     and a.completed_at is not null and a.visibility = 'visible' and a.left_at is null and a.banned_at is null
   group by ai.event_id, ai.tag_id;

  insert into public.event_stats (event_id, n, rebuilt_at)
  select e.id,
         (select count(*) from public.attendees a
           where a.event_id = e.id and a.completed_at is not null and a.visibility = 'visible'
             and a.left_at is null and a.banned_at is null),
         now()
    from unnest(p_event_ids) as e(id)
  on conflict (event_id) do update set n = excluded.n, rebuilt_at = excluded.rebuilt_at;
$$;

-- Claims dirty events (clearing the flag first, so changes made while rebuilding re-mark them
-- and are picked up by the next run), then rebuilds them. Returns how many were rebuilt.
create function private.rebuild_dirty_event_stats()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  with claimed as (
    update public.events set stats_dirty = false
     where stats_dirty and deleted_at is null
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from claimed;
  if cardinality(v_ids) > 0 then
    perform private.rebuild_event_stats(v_ids);
  end if;
  return cardinality(v_ids);
end;
$$;

-- Hidden tags and merges change who counts for what.
create function private.interest_tags_mark_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.hidden is distinct from old.hidden or new.merged_into is distinct from old.merged_into then
    perform private.mark_stats_dirty(new.event_id);
  end if;
  return null;
end;
$$;

create trigger interest_tags_mark_dirty
  after update on public.interest_tags
  for each row execute function private.interest_tags_mark_dirty();

select cron.schedule('rebuild-event-stats', '30 seconds', $$select private.rebuild_dirty_event_stats()$$);

-- ---------------------------------------------------------------------------
-- get_matches
-- ---------------------------------------------------------------------------

-- p_mode 'matches': attendees sharing ≥ 1 interest, ranked by
--   score = Σ over shared tags of ln(1 + N / coalesce(count_t, 1))   (rarer tags weigh more; always > 0)
--   tie-break: most recently completed profile.
-- p_mode 'everyone': attendees sharing no interests, newest first.
-- p_tag narrows either list to attendees holding that tag.
create function public.get_matches(
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
  v_me     uuid;
  v_n      double precision;
  v_limit  integer := least(greatest(p_limit, 1), 100);
  v_offset integer := greatest(p_offset, 0);
begin
  if p_mode not in ('matches', 'everyone') then
    raise exception 'invalid mode' using errcode = '22023';
  end if;
  select a.id into v_me from public.attendees a
   where a.event_id = p_event_id and a.user_id = auth.uid()
     and a.completed_at is not null and a.left_at is null and a.banned_at is null;
  if v_me is null then
    raise exception 'not an attendee of this event' using errcode = '42501';
  end if;
  v_n := greatest(coalesce((select s.n from public.event_stats s where s.event_id = p_event_id), 1), 1);

  -- Performance: score with tag ids only, rank, and only then fetch names and labels for the
  -- page being returned. Eligibility always comes from live tables (Phase 4 adds blocks).
  if p_mode = 'matches' then
    return query
    with weights as (
      select mi.tag_id, ln(1 + v_n / coalesce(st.count, 1)::double precision) as w
        from public.attendee_interests mi
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
         and not exists (select 1 from public.attendee_interests x
                          join public.attendee_interests mi on mi.tag_id = x.tag_id and mi.attendee_id = v_me
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

-- Interest filter chips: the event's visible tags with how many eligible attendees hold them.
create function public.get_event_tag_counts(p_event_id uuid)
returns table (tag_id uuid, label text, holders integer, mine boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid;
begin
  select a.id into v_me from public.attendees a
   where a.event_id = p_event_id and a.user_id = auth.uid()
     and a.completed_at is not null and a.left_at is null and a.banned_at is null;
  if v_me is null then
    raise exception 'not an attendee of this event' using errcode = '42501';
  end if;
  return query
    select t.id, t.label, coalesce(st.count, 0),
           exists (select 1 from public.attendee_interests ai where ai.attendee_id = v_me and ai.tag_id = t.id)
      from public.interest_tags t
      left join public.event_tag_stats st on st.event_id = p_event_id and st.tag_id = t.id
     where t.event_id = p_event_id and not t.hidden and t.merged_into is null
       and (coalesce(st.count, 0) > 0
            or exists (select 1 from public.attendee_interests ai where ai.attendee_id = v_me and ai.tag_id = t.id))
     order by coalesce(st.count, 0) desc, t.label;
end;
$$;

revoke execute on function public.get_matches(uuid, text, uuid, integer, integer), public.get_event_tag_counts(uuid)
  from public, anon;
grant execute on function public.get_matches(uuid, text, uuid, integer, integer), public.get_event_tag_counts(uuid)
  to authenticated;
revoke execute on function private.rebuild_event_stats(uuid[]), private.rebuild_dirty_event_stats(),
                          private.interest_tags_mark_dirty()
  from public, anon, authenticated;
