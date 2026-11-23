begin;
select plan(22);

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create temp table k (name text primary key, id uuid);
grant select, insert on k to authenticated;
grant select on k to anon;
create function pg_temp.k(p text) returns uuid language sql as $$ select id from k where name = p $$;
grant execute on function pg_temp.k(text) to authenticated, anon;
-- Announcement push jobs queued for this test's event.
create function pg_temp.jobs() returns setof jsonb language sql as $$
  select message from pgmq.q_push_jobs
   where message ->> 'kind' = 'announcement' and message ->> 'event_id' = (select id::text from k where name = 'e');
$$;

-- Owner O; event E with interests Rust, Go, rustlang; attendees R (Rust, subscribed), G (Go, subscribed),
-- L (Rust, left the event); other event F with interest Elm.
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('13000000-0000-0000-0000-000000000000', 'o13@test.dev', 'authenticated', 'authenticated', '{"full_name":"Olga"}'),
  ('13000000-0000-0000-0000-000000000001', 'r13@test.dev', 'authenticated', 'authenticated', '{"full_name":"Rae"}'),
  ('13000000-0000-0000-0000-000000000002', 'g13@test.dev', 'authenticated', 'authenticated', '{"full_name":"Gil"}'),
  ('13000000-0000-0000-0000-000000000003', 'l13@test.dev', 'authenticated', 'authenticated', '{"full_name":"Lou"}');
insert into k values ('o', '13000000-0000-0000-0000-000000000000'), ('ur', '13000000-0000-0000-0000-000000000001'),
                     ('ug', '13000000-0000-0000-0000-000000000002'), ('ul', '13000000-0000-0000-0000-000000000003');
with org as (insert into public.organizations (name, slug) values ('Org13', 'org-targeted') returning id)
insert into k select 'org', id from org;
insert into public.org_members values (pg_temp.k('org'), pg_temp.k('o'), 'owner');
with e as (insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
           values (pg_temp.k('org'), 'targeted-ev', 'T', now(), now() + interval '1 day', 'UTC', 'published', now()) returning id)
insert into k select 'e', id from e;
with f as (insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
           values (pg_temp.k('org'), 'targeted-other', 'T2', now(), now() + interval '1 day', 'UTC', 'published', now()) returning id)
insert into k select 'f', id from f;
with t as (insert into public.interest_tags (event_id, label, is_official) values (pg_temp.k('e'), 'Rust', true) returning id)
insert into k select 'rust', id from t;
with t as (insert into public.interest_tags (event_id, label, is_official) values (pg_temp.k('e'), 'Go', true) returning id)
insert into k select 'go', id from t;
with t as (insert into public.interest_tags (event_id, label) values (pg_temp.k('e'), 'rustlang') returning id)
insert into k select 'rustlang', id from t;
with t as (insert into public.interest_tags (event_id, label, is_official) values (pg_temp.k('f'), 'Elm', true) returning id)
insert into k select 'elm', id from t;

with x as (insert into public.attendees (event_id, user_id, joined_via, completed_at)
  values (pg_temp.k('e'), pg_temp.k('ur'), 'link', now()) returning id)
insert into k select 'r', id from x;
with x as (insert into public.attendees (event_id, user_id, joined_via, completed_at)
  values (pg_temp.k('e'), pg_temp.k('ug'), 'link', now()) returning id)
insert into k select 'g', id from x;
with x as (insert into public.attendees (event_id, user_id, joined_via, completed_at, left_at)
  values (pg_temp.k('e'), pg_temp.k('ul'), 'link', now(), now()) returning id)
insert into k select 'l', id from x;
insert into public.attendee_interests (attendee_id, tag_id, event_id) values
  (pg_temp.k('r'), pg_temp.k('rust'), pg_temp.k('e')),
  (pg_temp.k('g'), pg_temp.k('go'), pg_temp.k('e')),
  (pg_temp.k('l'), pg_temp.k('rust'), pg_temp.k('e'));
insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth) values
  ('13000000-0000-0000-0000-0000000000a1', pg_temp.k('ur'), 'https://push.example/r13', 'k', 'a'),
  ('13000000-0000-0000-0000-0000000000a2', pg_temp.k('ug'), 'https://push.example/g13', 'k', 'a');
insert into public.push_subscription_events values
  ('13000000-0000-0000-0000-0000000000a1', pg_temp.k('e')), ('13000000-0000-0000-0000-0000000000a2', pg_temp.k('e'));

-- ---------------------------------------------------------------- writing
set local role authenticated;
select pg_temp.as_user(pg_temp.k('o'));
select is((select array_agg(label || ':' || attendees order by label) from public.get_announcement_audiences(pg_temp.k('e'))),
          array['Go:1', 'Rust:1', 'rustlang:0'], 'composer lists interests with active attendees (left ones not counted)');
select throws_ok($$insert into public.announcements (event_id, title, target_tag_id)
                   values (pg_temp.k('e'), 'Wrong event', pg_temp.k('elm'))$$,
                 'P0001', 'that interest is not part of this event', 'the interest must belong to the event');
select lives_ok($$insert into public.announcements (event_id, title, target_tag_id)
                  values (pg_temp.k('e'), 'Rust meetup at 3', pg_temp.k('rust'))$$, 'organizer posts to an interest');
insert into k select 'ann_rust', id from public.announcements where title = 'Rust meetup at 3';
insert into public.announcements (event_id, title) values (pg_temp.k('e'), 'Doors open');
insert into k select 'ann_all', id from public.announcements where title = 'Doors open';
select throws_ok($$update public.announcements set target_tag_id = null where id = pg_temp.k('ann_rust')$$,
                 '42501', null, 'the audience cannot be changed afterwards');
select lives_ok($$select public.publish_announcement(pg_temp.k('ann_rust'))$$, 'publish the targeted post');
select lives_ok($$select public.publish_announcement(pg_temp.k('ann_all'))$$, 'publish the post for everyone');

-- ---------------------------------------------------------------- push
reset role;
select is((select (m ->> 'tag_id')::uuid from pg_temp.jobs() m where m ->> 'title' = 'Rust meetup at 3'), pg_temp.k('rust'),
          'the push job carries the interest');
select ok((select m ? 'tag_id' and m ->> 'tag_id' is null from pg_temp.jobs() m where m ->> 'title' = 'Doors open'),
          'posts for everyone have no interest on the job');
-- An interest nobody subscribed has: no job at all.
set local role authenticated;
select pg_temp.as_user(pg_temp.k('o'));
insert into public.announcements (event_id, title, target_tag_id) values (pg_temp.k('e'), 'Rustlang only', pg_temp.k('rustlang'));
select public.publish_announcement((select id from public.announcements where title = 'Rustlang only'));
reset role;
select is((select count(*)::int from pg_temp.jobs() m where m ->> 'title' = 'Rustlang only'), 0,
          'no job when no subscriber has the interest');

-- ---------------------------------------------------------------- reading
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ur'));
select is((select array_agg(title order by title) from public.announcements where event_id = pg_temp.k('e')),
          array['Doors open', 'Rust meetup at 3'], 'an attendee with the interest sees it');
select pg_temp.as_user(pg_temp.k('ug'));
select is((select array_agg(title order by title) from public.announcements where event_id = pg_temp.k('e')),
          array['Doors open'], 'an attendee without the interest does not');
select pg_temp.as_user(pg_temp.k('ul'));
select is((select count(*)::int from public.announcements where id = pg_temp.k('ann_rust')), 0,
          'someone who left the event does not');
select pg_temp.as_user(pg_temp.k('o'));
select is((select count(*)::int from public.announcements where event_id = pg_temp.k('e')), 3, 'organizers see every post');
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select is((select array_agg(title) from public.announcements where event_id = pg_temp.k('e')),
          array['Doors open'], 'the public event page shows only posts for everyone');
reset role;

-- ---------------------------------------------------------------- interest changes
-- R drops Rust: the post disappears for them.
delete from public.attendee_interests where attendee_id = pg_temp.k('r') and tag_id = pg_temp.k('rust');
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ur'));
select is((select count(*)::int from public.announcements where id = pg_temp.k('ann_rust')), 0,
          'dropping the interest hides the post');
reset role;
-- G picks Rust: they now see it.
insert into public.attendee_interests (attendee_id, tag_id, event_id) values (pg_temp.k('g'), pg_temp.k('rust'), pg_temp.k('e'));
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ug'));
select is((select count(*)::int from public.announcements where id = pg_temp.k('ann_rust')), 1,
          'picking the interest shows the post');

-- Merging rustlang into Rust moves its posts along.
select pg_temp.as_user(pg_temp.k('o'));
select lives_ok($$select public.merge_tags(pg_temp.k('rustlang'), pg_temp.k('rust'))$$, 'merge rustlang into Rust');
select is((select target_tag_id from public.announcements where title = 'Rustlang only'), pg_temp.k('rust'),
          'posts follow the merged interest');
select pg_temp.as_user(pg_temp.k('ug'));
select is((select count(*)::int from public.announcements where title = 'Rustlang only'), 1,
          'and reach the people who now have it');
select throws_ok($$select * from public.get_announcement_audiences(pg_temp.k('e'))$$, '42501', null,
                 'attendees cannot list audiences');
reset role;

-- ---------------------------------------------------------------- privileges
select ok(not has_function_privilege('anon', 'public.get_announcement_audiences(uuid)', 'execute'),
          'anon cannot list audiences');
select ok(not has_function_privilege('authenticated', 'private.enqueue_push(text, uuid, uuid, text, text, text, text, uuid)', 'execute'),
          'enqueue_push stays internal');

select * from finish();
rollback;
