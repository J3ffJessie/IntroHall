begin;
select plan(17);

create function pg_temp.mk_attendee(p_event uuid, p_name text, p_tags uuid[], p_open text[])
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid(); v_att uuid;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (v_user, v_user || '@o.test', 'authenticated', 'authenticated', json_build_object('full_name', p_name));
  insert into public.attendees (event_id, user_id, joined_via, completed_at, open_to)
  values (p_event, v_user, 'link', now(), p_open) returning id into v_att;
  insert into public.attendee_interests (attendee_id, tag_id, event_id) select v_att, t, p_event from unnest(p_tags) t;
  return v_user;
end $$;
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create temp table k (name text primary key, id uuid);
grant select on k to authenticated;
create function pg_temp.u(p_name text) returns uuid language sql as $$ select id from k where name = p_name $$;
create function pg_temp.ev() returns uuid language sql as $$ select id from k where name = 'e' $$;
grant execute on function pg_temp.u(text), pg_temp.ev() to authenticated;

with x as (insert into public.organizations (name, slug) values ('Org11', 'org-open-to') returning id)
insert into k select 'org', id from x;
with x as (
  insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
  values ((select id from k where name = 'org'), 'open-to-ev', 'OpenTo', now(), now() + interval '1 day', 'UTC', 'published', now())
  returning id)
insert into k select 'e', id from x;
with x as (insert into public.interest_tags (event_id, label, is_official) values (pg_temp.ev(), 'Rust', true) returning id)
insert into k select 'rust', id from x;
with x as (insert into public.interest_tags (event_id, label, is_official) values (pg_temp.ev(), 'Go', true) returning id)
insert into k select 'go', id from x;

insert into k values ('me',  pg_temp.mk_attendee(pg_temp.ev(), 'Me',  array[(select id from k where name = 'rust')], array['hiring']));
insert into k values ('jo',  pg_temp.mk_attendee(pg_temp.ev(), 'Jo',  array[(select id from k where name = 'rust')], array['job_seeking', 'mentoring']));
insert into k values ('mo',  pg_temp.mk_attendee(pg_temp.ev(), 'Mo',  array[(select id from k where name = 'rust')], '{}'));
insert into k values ('gus', pg_temp.mk_attendee(pg_temp.ev(), 'Gus', array[(select id from k where name = 'go')], array['job_seeking']));
insert into k values ('lea', pg_temp.mk_attendee(pg_temp.ev(), 'Lea', array[(select id from k where name = 'go')], array['job_seeking']));
update public.attendees set left_at = now() where user_id = pg_temp.u('lea');
insert into k values ('org_owner', gen_random_uuid());
insert into auth.users (id, email, aud, role) values (pg_temp.u('org_owner'), 'owner@o.test', 'authenticated', 'authenticated');
insert into public.org_members (org_id, user_id, role) values ((select id from k where name = 'org'), pg_temp.u('org_owner'), 'owner');

-- ---------------------------------------------------------------- the column
select is((select open_to from public.attendees where user_id = pg_temp.u('mo')), '{}'::text[], 'defaults to none');
select throws_ok($$update public.attendees set open_to = array['dating'] where user_id = pg_temp.u('mo')$$,
                 '23514', null, 'unknown options are rejected');
select throws_ok($$update public.attendees set open_to = null where user_id = pg_temp.u('mo')$$,
                 '23502', null, 'never null');

set local role authenticated;
select pg_temp.as_user(pg_temp.u('mo'));
select lives_ok($$update public.attendees set open_to = array['cofounder'] where user_id = pg_temp.u('mo')$$,
                'attendees set their own open_to');
select is((select open_to from public.attendees where user_id = pg_temp.u('mo')), array['cofounder'], 'saved');
update public.attendees set open_to = array['investing'] where user_id = pg_temp.u('jo');
reset role;
select is((select open_to from public.attendees where user_id = pg_temp.u('jo')), array['job_seeking', 'mentoring'],
          'but not anyone else''s');

-- ---------------------------------------------------------------- matches
set local role authenticated;
select pg_temp.as_user(pg_temp.u('me'));
select is((select open_to from public.get_matches(pg_temp.ev()) where full_name = 'Jo'), array['job_seeking', 'mentoring'],
          'matches carry open_to');
select is((select array_agg(full_name order by full_name) from public.get_matches(pg_temp.ev())), array['Jo', 'Mo'],
          'no filter: everyone who shares an interest');
select is((select array_agg(full_name) from public.get_matches(pg_temp.ev(), p_open_to => 'job_seeking')), array['Jo'],
          'filter on matches');
select is((select count(*)::int from public.get_matches(pg_temp.ev(), p_open_to => 'investing')), 0, 'filter with no one');
select is((select array_agg(full_name) from public.get_matches(pg_temp.ev(), 'everyone', p_open_to => 'job_seeking')), array['Gus'],
          'filter on Everyone (left attendees still excluded)');
select is((select open_to from public.get_matches(pg_temp.ev(), 'everyone') where full_name = 'Gus'), array['job_seeking'],
          'Everyone rows carry open_to');

-- ---------------------------------------------------------------- organizer analytics
select pg_temp.as_user(pg_temp.u('org_owner'));
select is(public.get_event_analytics(pg_temp.ev()) -> 'open_to',
          '[{"intent": "job_seeking", "attendees": 2}, {"intent": "cofounder", "attendees": 1},
            {"intent": "hiring", "attendees": 1}, {"intent": "mentoring", "attendees": 1}]'::jsonb,
          'totals per intent, most first, active attendees only');
select ok(public.get_event_analytics(pg_temp.ev()) ? 'top_tags', 'the rest of the analytics are still there');
select pg_temp.as_user(pg_temp.u('me'));
select throws_ok($$select public.get_event_analytics(pg_temp.ev())$$, '42501', null, 'attendees cannot read analytics');
select throws_ok($$select private.get_event_analytics_base(pg_temp.ev())$$, '42501', null, 'the base function is not callable');

reset role;
select ok(not has_function_privilege('anon', 'public.get_matches(uuid, text, uuid, integer, integer, text)', 'execute'),
          'anon cannot call get_matches');

select * from finish();
rollback;
