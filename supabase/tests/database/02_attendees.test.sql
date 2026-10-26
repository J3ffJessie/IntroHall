begin;
select plan(58);

-- Organizer O owns org with events E1 (open) and E2 (code mode). Attendees A, B, C, D.
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'o@test.dev', 'authenticated', 'authenticated', '{"full_name":"Olive Org"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'a@test.dev', 'authenticated', 'authenticated', '{"full_name":"Ada"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@test.dev', 'authenticated', 'authenticated', '{"full_name":"Bob"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@test.dev', 'authenticated', 'authenticated', '{"full_name":"Cy"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@test.dev', 'authenticated', 'authenticated', '{"full_name":"Dee"}'),
  ('00000000-0000-0000-0000-0000000000e1', 'x@test.dev', 'authenticated', 'authenticated', '{"full_name":"Xander"}');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.from_ip(p_ip text) returns void language sql as $$
  select set_config('request.headers', json_build_object('x-forwarded-for', p_ip || ', 10.0.0.1')::text, true);
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

-- ---------------------------------------------------------------- organizer setup
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into ids values ('org', public.create_organization('Org', 'org-p2'));
insert into public.events (org_id, slug, name, starts_at, ends_at, timezone)
values ((select v::uuid from ids where k = 'org'), 'e1-open', 'E1', now(), now() + interval '1 day', 'UTC'),
       ((select v::uuid from ids where k = 'org'), 'e2-code', 'E2', now(), now() + interval '1 day', 'UTC'),
       ((select v::uuid from ids where k = 'org'), 'e3-draft', 'E3', now(), now() + interval '1 day', 'UTC');
insert into ids select 'e' || substr(slug, 2, 1), id::text from public.events where slug in ('e1-open', 'e2-code', 'e3-draft');
insert into public.interest_tags (event_id, label)
select (select v::uuid from ids where k = 'e1'), l from unnest(array['Machine Learning', 'Rust', 'Design', 'Secret']) l;
insert into public.interest_tags (event_id, label) values ((select v::uuid from ids where k = 'e2'), 'Go');
update public.interest_tags set hidden = true where label = 'Secret';
update public.events set join_mode = 'code' where slug = 'e2-code';
insert into ids values ('code', public.rotate_join_code((select v::uuid from ids where k = 'e2')));
select public.publish_event((select v::uuid from ids where k = 'e1'));
select public.publish_event((select v::uuid from ids where k = 'e2'));
-- Scoped to this test's events: other (e2e) events may have tags with the same labels.
create function pg_temp.tag(p_label text) returns uuid language sql as $$
  select id from public.interest_tags
   where label = p_label and event_id in (select v::uuid from ids where k in ('e1', 'e2'));
$$;
reset role;
grant execute on function pg_temp.tag(text) to authenticated;
set local role authenticated;

-- ---------------------------------------------------------------- joining
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is((select status from public.join_event('e3-draft')), 'not_found', 'draft events cannot be joined');
select is((select status from public.join_event('nope-nope')), 'not_found', 'unknown slug');
select is((select status from public.join_event('E1-OPEN')), 'joined', 'A joins open event (slug case-insensitive)');
select is((select status from public.join_event('e1-open')), 'already_joined', 'second join is idempotent');
select is((select joined_via from public.attendees), 'link', 'joined_via recorded');
select is((select count(*)::int from public.attendees where user_id = auth.uid()), 1, 'one attendee row');

-- Direct writes are blocked; only the RPCs change membership.
select throws_ok($$insert into public.attendees (event_id, user_id, joined_via)
                   values ((select v::uuid from ids where k = 'e2'), auth.uid(), 'link')$$,
                 '42501', null, 'cannot insert attendees directly');
select throws_ok($$update public.attendees set completed_at = now()$$, '42501', null, 'cannot set completed_at');
select throws_ok($$update public.attendees set banned_at = null, left_at = null$$, '42501', null, 'cannot clear left/banned');
select throws_ok($$insert into public.attendee_interests (attendee_id, tag_id, event_id)
                   select id, pg_temp.tag('Rust'), event_id from public.attendees$$,
                 '42501', null, 'cannot write interests directly');

-- ---------------------------------------------------------------- interests
select throws_ok($$select public.upsert_interests((select v::uuid from ids where k = 'e1'), '{}', '{}')$$,
                 'P0001', null, 'at least one interest');
select throws_ok($$select public.upsert_interests((select v::uuid from ids where k = 'e1'), array[pg_temp.tag('Secret')], '{}')$$,
                 'P0001', null, 'hidden tag rejected');
select throws_ok($$select public.upsert_interests((select v::uuid from ids where k = 'e1'), array[pg_temp.tag('Go')], '{}')$$,
                 'P0001', null, 'another event''s tag rejected');
select throws_ok($$select public.upsert_interests((select v::uuid from ids where k = 'e1'), '{}',
                   array['a','b','c','d'])$$, 'P0001', null, 'more than max_custom_interests (3) rejected');
select throws_ok($$select public.upsert_interests((select v::uuid from ids where k = 'e1'),
                   array[pg_temp.tag('Rust')], array['c1','c2','c3','x1','x2','x3','x4','x5','x6','x7'])$$,
                 'P0001', null, 'more than 10 total rejected');
select throws_ok($$select public.upsert_interests((select v::uuid from ids where k = 'e2'), array[pg_temp.tag('Go')], '{}')$$,
                 '42501', null, 'not an attendee of e2');

select lives_ok($$select public.upsert_interests((select v::uuid from ids where k = 'e1'),
                  array[pg_temp.tag('Rust')], array['  Machine   Learning', 'ＭＡＣＨＩＮＥ learning', 'Coffee'])$$,
                'A saves interests with custom labels');
select is((select array_agg(t.label order by t.label) from public.attendee_interests ai
             join public.interest_tags t on t.id = ai.tag_id),
          array['Coffee', 'Machine Learning', 'Rust'], 'both ML spellings reuse the official tag; Coffee created');
select is((select is_official from public.interest_tags where id = pg_temp.tag('Coffee')), false, 'attendee tag is not official');
select isnt((select completed_at from public.attendees), null, 'profile marked complete');
select lives_ok($$update public.attendees set bio = 'Hi', looking_for = 'Rust folks'$$, 'A edits own bio');
select lives_ok($$select public.upsert_interests((select v::uuid from ids where k = 'e1'), array[pg_temp.tag('Design')], '{}')$$,
                'A replaces interests');
select is((select array_agg(t.label) from public.attendee_interests ai join public.interest_tags t on t.id = ai.tag_id),
          array['Design'], 'old interests removed');

reset role;
select is((select stats_dirty from public.events where slug = 'e1-open'), true, 'interest change marks stats dirty');
update public.events set allow_custom_interests = false where slug = 'e1-open';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.upsert_interests((select v::uuid from ids where k = 'e1'), '{}', array['Tea'])$$,
                 'P0001', null, 'custom interests off → rejected');
reset role;
update public.events set allow_custom_interests = true where slug = 'e1-open';
set local role authenticated;

-- ---------------------------------------------------------------- join codes and rate limits
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.from_ip('203.0.113.7');
select is((select status from public.join_event('e2-code')), 'code_required', 'code mode needs a code');
select is((select status from public.join_event('e2-code', 'WRONGCODE2')), 'invalid_code', 'wrong code');
select is((select count(*)::int from (select public.join_event('e2-code', 'WRONGCODE2')) x), 1, 'third failure');
reset role;
select is((select count(*)::int from public.join_attempts where user_id = '00000000-0000-0000-0000-0000000000b1' and not success),
          3, 'failed attempts recorded (not rolled back)');
insert into public.join_attempts (ip_hash, user_id, event_id, success)
select null, '00000000-0000-0000-0000-0000000000b1', (select v::uuid from ids where k = 'e2'), false from generate_series(1, 7);
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select is((select status from public.join_event('e2-code', (select v from ids where k = 'code'))), 'rate_limited',
          '11th attempt after 10 failures is rejected even with the right code');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.from_ip('203.0.113.7');
select is((select status from public.join_event('e2-code', lower((select v from ids where k = 'code')))), 'joined',
          'another user on the same IP joins with the right code (case-insensitive)');
select is((select joined_via from public.attendees where user_id = auth.uid()), 'code', 'joined_via code');

-- Shared venue IP: 500 successes don't block; 500 failures do.
reset role;
insert into public.join_attempts (ip_hash, user_id, event_id, success)
select (select private.sha256_hex('198.51.100.9' || (select value from private.secrets where key = 'ip_salt'))),
       gen_random_uuid(), (select v::uuid from ids where k = 'e2'), true
  from generate_series(1, 500);
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.from_ip('198.51.100.9');
select is((select status from public.join_event('e2-code', (select v from ids where k = 'code'))), 'joined',
          '500 successful joins from one IP do not block the next');
reset role;
insert into public.join_attempts (ip_hash, user_id, event_id, success)
select (select private.sha256_hex('198.51.100.9' || (select value from private.secrets where key = 'ip_salt'))),
       gen_random_uuid(), (select v::uuid from ids where k = 'e2'), false
  from generate_series(1, 500);
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.from_ip('198.51.100.9');
select is((select status from public.join_event('e2-code', (select v from ids where k = 'code'))), 'rate_limited',
          '500 failures from one IP block further attempts from it');
select pg_temp.from_ip('192.0.2.50');
select is((select status from public.join_event('e2-code', (select v from ids where k = 'code'))), 'joined',
          'a different IP is unaffected');

-- ---------------------------------------------------------------- one account, two events
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select lives_ok($$select public.upsert_interests((select v::uuid from ids where k = 'e2'), array[pg_temp.tag('Go')], '{}')$$,
                'C sets e2 interests');
select is((select status from public.join_event('e1-open')), 'joined', 'C also joins e1');
select lives_ok($$select public.upsert_interests((select v::uuid from ids where k = 'e1'), array[pg_temp.tag('Rust')], '{}')$$,
                'C sets different e1 interests');
select is((select count(distinct event_id)::int from public.attendees where user_id = auth.uid()), 2,
          'one account, two attendee profiles');
select is((select array_agg(t.label order by t.label) from public.attendee_interests ai
             join public.attendees a on a.id = ai.attendee_id join public.interest_tags t on t.id = ai.tag_id
            where a.user_id = auth.uid()),
          array['Go', 'Rust'], 'interests are per event');

-- ---------------------------------------------------------------- R3 visibility
-- A (e1, complete, visible) and C (e1, complete) see each other; D (e2 only) sees neither.
select is((select count(*)::int from public.attendees where event_id = (select v::uuid from ids where k = 'e1')), 2,
          'C sees self and A in e1');
select is((select full_name from public.accounts where user_id = '00000000-0000-0000-0000-0000000000a1'), 'Ada',
          'C reads co-attendee A''s base profile');
select is((select count(*)::int from public.attendee_interests ai
             join public.attendees a on a.id = ai.attendee_id where a.user_id = '00000000-0000-0000-0000-0000000000a1'), 1,
          'C reads A''s interests');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from public.attendees where event_id = (select v::uuid from ids where k = 'e1')), 0,
          'non-member of e1 sees no e1 attendees');
select is((select count(*)::int from public.accounts where user_id = '00000000-0000-0000-0000-0000000000a1'), 0,
          'non-member cannot read A''s account');
-- D joined e2 but has not completed a profile: cannot see e2 co-attendees yet, and is not visible to them.
select is((select count(*)::int from public.attendees where event_id = (select v::uuid from ids where k = 'e2')), 1,
          'incomplete attendee sees only self');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
update public.attendees set visibility = 'hidden';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.attendees where user_id = '00000000-0000-0000-0000-0000000000a1'), 0,
          'hidden attendee disappears for others');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
update public.attendees set visibility = 'visible';

-- ---------------------------------------------------------------- roster (R4)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.get_event_roster((select v::uuid from ids where k = 'e1'))), 2, 'organizer roster lists joined attendees');
select is((select count(*)::int from public.attendees where event_id = (select v::uuid from ids where k = 'e1')), 0,
          'organizer cannot read attendee rows (bios) directly');
select is((select count(*)::int from public.attendee_interests), 0, 'organizer cannot read individual interests');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$select * from public.get_event_roster((select v::uuid from ids where k = 'e1'))$$, '42501', null,
                 'non-organizer cannot read roster');

-- ---------------------------------------------------------------- leave, remove, ban
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.leave_event((select v::uuid from ids where k = 'e1'))$$, 'A leaves e1');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.attendees where user_id = '00000000-0000-0000-0000-0000000000a1'), 0,
          'left attendee disappears for others');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is((select status from public.join_event('e1-open')), 'joined', 'A can rejoin after leaving');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$select public.remove_attendee((select id from public.attendees where user_id = '00000000-0000-0000-0000-0000000000a1'), true)$$,
                 '42501', null, 'attendees cannot remove others');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.remove_attendee((select r.attendee_id from public.get_event_roster((select v::uuid from ids where k = 'e1')) r
                                                 where r.full_name = 'Cy'), true)$$,
                'organizer removes and bans C');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select is((select status from public.join_event('e1-open')), 'banned', 'banned user cannot rejoin');

-- ---------------------------------------------------------------- attendee limit
reset role;
-- Only A is active in e1 now (C was banned), so a limit of 1 is reached.
update public.organizations set attendee_limit = 1 where slug = 'org-p2';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select is((select status from public.join_event('e1-open')), 'full', 'join blocked at attendee_limit');

reset role;
select * from finish();
rollback;
