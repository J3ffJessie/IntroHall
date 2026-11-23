-- "Open to" intent chips on the event profile: hiring, looking for work, mentoring, … A fixed list
-- (labels live in lib/open-to.ts), shown on match cards and usable as a Matches filter. Per event,
-- like bio and looking_for. Organizers see totals only, like interests.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- Constant default: no table rewrite. The check is on the new column, so existing rows all hold '{}'.
-- squawk-ignore adding-not-nullable-field
alter table public.attendees add column open_to text[] not null default '{}'
  constraint attendees_open_to_valid
  check (open_to <@ array['hiring', 'job_seeking', 'mentoring', 'seeking_mentor', 'cofounder', 'investing', 'fundraising']::text[]
         and cardinality(open_to) <= 7);
grant update (open_to) on public.attendees to authenticated;

-- ---------------------------------------------------------------------------
-- Matches: same ranking as before, plus open_to on each row and an optional p_open_to filter.
-- ---------------------------------------------------------------------------
-- The return type changes, so drop and recreate in this transaction; the app is updated alongside.
-- squawk-ignore ban-drop-function
drop function public.get_matches(uuid, text, uuid, integer, integer);

create function public.get_matches(
  p_event_id uuid,
  p_mode     text default 'matches',
  p_tag      uuid default null,
  p_limit    integer default 50,
  p_offset   integer default 0,
  p_open_to  text default null
)
returns table (
  attendee_id  uuid,
  full_name    text,
  headline     text,
  company      text,
  avatar_path  text,
  bio          text,
  looking_for  text,
  open_to      text[],
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
      select a.id, a.user_id, a.bio, a.looking_for, a.open_to, a.completed_at, s.score
        from scores s
        join public.attendees a on a.id = s.id
       where a.completed_at is not null and a.visibility = 'visible' and a.left_at is null and a.banned_at is null
         and a.id <> all(v_blocked)
         and (p_tag is null or exists (select 1 from public.attendee_interests f
                                        where f.attendee_id = a.id and f.tag_id = p_tag))
         and (p_open_to is null or p_open_to = any(a.open_to))
       order by s.score desc, a.completed_at desc, a.id
       limit v_limit offset v_offset
    )
    select p.id, ac.full_name, ac.headline, ac.company, ac.avatar_path, p.bio, p.looking_for, p.open_to,
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
      select a.id, a.user_id, a.bio, a.looking_for, a.open_to, a.completed_at
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
         and (p_open_to is null or p_open_to = any(a.open_to))
       order by a.completed_at desc, a.id
       limit v_limit offset v_offset
    )
    select p.id, ac.full_name, ac.headline, ac.company, ac.avatar_path, p.bio, p.looking_for, p.open_to,
           '{}'::text[], 0::double precision, p.completed_at
      from page p
      join public.accounts ac on ac.user_id = p.user_id
     order by p.completed_at desc, p.id;
  end if;
end;
$$;

revoke all on function public.get_matches(uuid, text, uuid, integer, integer, text) from public, anon;
grant execute on function public.get_matches(uuid, text, uuid, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Organizer analytics: the previous object plus open_to totals (active attendees, never per person).
-- ---------------------------------------------------------------------------
-- The public name is recreated just below in the same transaction, so clients never see it missing.
-- squawk-ignore renaming-object
alter function public.get_event_analytics(uuid) rename to get_event_analytics_base;
-- squawk-ignore ban-set-schema
alter function public.get_event_analytics_base(uuid) set schema private;
revoke all on function private.get_event_analytics_base(uuid) from public, anon, authenticated;

create function public.get_event_analytics(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- The base function checks org membership and raises for anyone else.
  return private.get_event_analytics_base(p_event_id) || jsonb_build_object(
    'open_to', coalesce((
      select jsonb_agg(jsonb_build_object('intent', intent, 'attendees', n) order by n desc, intent)
        from (select o.intent, count(*) as n
                from public.attendees a, unnest(a.open_to) as o(intent)
               where a.event_id = p_event_id
                 and a.completed_at is not null and a.left_at is null and a.banned_at is null
               group by o.intent) s), '[]'::jsonb));
end;
$$;

revoke all on function public.get_event_analytics(uuid) from public, anon;
grant execute on function public.get_event_analytics(uuid) to authenticated;
