begin;
select plan(35);

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create temp table k (name text primary key, id uuid);
grant select, insert on k to authenticated;
grant select on k to anon;
create function pg_temp.k(p text) returns uuid language sql as $$ select id from k where name = p $$;
grant execute on function pg_temp.k(text) to authenticated;
-- Push jobs queued for this test's event.
create function pg_temp.jobs(p_kind text) returns integer language sql as $$
  select count(*)::int from pgmq.q_push_jobs
   where message ->> 'kind' = p_kind and message ->> 'event_id' = (select id::text from k where name = 'e');
$$;

-- Org owner O; event E (published) and D (draft); attendees A, B; outsider X.
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000005a0', 'o5@test.dev', 'authenticated', 'authenticated', '{"full_name":"Olga"}'),
  ('00000000-0000-0000-0000-0000000005a1', 'a5@test.dev', 'authenticated', 'authenticated', '{"full_name":"Ann"}'),
  ('00000000-0000-0000-0000-0000000005a2', 'b5@test.dev', 'authenticated', 'authenticated', '{"full_name":"Bob"}'),
  ('00000000-0000-0000-0000-0000000005a3', 'x5@test.dev', 'authenticated', 'authenticated', '{"full_name":"Xi"}');
insert into k values ('o', '00000000-0000-0000-0000-0000000005a0'), ('ua', '00000000-0000-0000-0000-0000000005a1'),
                     ('ub', '00000000-0000-0000-0000-0000000005a2'), ('ux', '00000000-0000-0000-0000-0000000005a3');
with org as (insert into public.organizations (name, slug) values ('Org5', 'org-phase5') returning id)
insert into k select 'org', id from org;
insert into public.org_members values (pg_temp.k('org'), pg_temp.k('o'), 'owner');
with e as (insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
           values (pg_temp.k('org'), 'phase5-ev', 'P5', now(), now() + interval '1 day', 'UTC', 'published', now()) returning id)
insert into k select 'e', id from e;
with d as (insert into public.events (org_id, slug, name, starts_at, ends_at, timezone)
           values (pg_temp.k('org'), 'phase5-draft', 'P5 draft', now(), now() + interval '1 day', 'UTC') returning id)
insert into k select 'd', id from d;
with a as (insert into public.attendees (event_id, user_id, joined_via, completed_at)
           values (pg_temp.k('e'), pg_temp.k('ua'), 'link', now()) returning id)
insert into k select 'a', id from a;
with b as (insert into public.attendees (event_id, user_id, joined_via, completed_at)
           values (pg_temp.k('e'), pg_temp.k('ub'), 'link', now()) returning id)
insert into k select 'b', id from b;

-- ---------------------------------------------------------------- subscriptions
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ux'));
select throws_ok($$select public.save_push_subscription(pg_temp.k('e'), 'https://push.example/x', 'k', 'a')$$,
                 '42501', null, 'non-attendee cannot subscribe for the event');
select pg_temp.as_user(pg_temp.k('ua'));
select lives_ok($$select public.save_push_subscription(pg_temp.k('e'), 'https://push.example/a', 'k', 'a', 'Chrome')$$, 'A subscribes');
select pg_temp.as_user(pg_temp.k('ub'));
select lives_ok($$select public.save_push_subscription(pg_temp.k('e'), 'https://push.example/b', 'k', 'a')$$, 'B subscribes');
select is((select count(*)::int from public.push_subscriptions), 1, 'B sees only own subscription');
select throws_ok($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), 'https://x', 'k', 'a')$$,
                 '42501', null, 'subscriptions are written only through the RPC');

-- ---------------------------------------------------------------- announcements
select pg_temp.as_user(pg_temp.k('o'));
insert into public.announcements (event_id, title, body) values (pg_temp.k('e'), 'Doors open', 'Grab a coffee');
insert into k select 'ann', id from public.announcements where title = 'Doors open';
select is((select author_user from public.announcements where id = pg_temp.k('ann')), pg_temp.k('o'), 'author recorded');
reset role;
set local role anon;
select is((select count(*)::int from public.announcements where event_id = (select id from k where name = 'e')), 0,
          'unpublished announcement is not public');
reset role;
set local role authenticated;
select pg_temp.as_user(pg_temp.k('o'));
select lives_ok($$select public.publish_announcement(pg_temp.k('ann'))$$, 'organizer publishes');
select lives_ok($$select public.publish_announcement(pg_temp.k('ann'))$$, 'publishing again is a no-op');
reset role;
select isnt((select published_at from public.announcements where id = pg_temp.k('ann')), null, 'published_at set');
select is(pg_temp.jobs('announcement'), 1, 'exactly one push job per announcement');
select cmp_ok((select count(*)::int from realtime.messages where topic = 'event:' || pg_temp.k('e') and event = 'announcement'), '>=', 1,
              'announcement broadcast to the event topic');
set local role anon;
select is((select title from public.announcements where event_id = (select id from k where name = 'e')), 'Doors open',
          'published announcement is public');
reset role;

set local role authenticated;
select pg_temp.as_user(pg_temp.k('ua'));
select throws_ok($$insert into public.announcements (event_id, title) values (pg_temp.k('e'), 'Fake')$$,
                 '42501', null, 'attendees cannot post announcements');
select throws_ok($$select public.publish_announcement(pg_temp.k('ann'))$$, '42501', null, 'attendees cannot publish');
select pg_temp.as_user(pg_temp.k('o'));
insert into public.announcements (event_id, title) values (pg_temp.k('d'), 'Too early');
select throws_ok($$select public.publish_announcement((select id from public.announcements where title = 'Too early'))$$,
                 'P0001', null, 'cannot publish on a draft event');

-- Scheduled: nothing before publish_at; exactly one claim after it.
insert into public.announcements (event_id, title, publish_at) values (pg_temp.k('e'), 'Lunch', now() + interval '1 hour');
reset role;
select is(private.claim_announcements(), 0, 'future scheduled post is not claimed');
update public.announcements set publish_at = now() - interval '1 second' where title = 'Lunch';
select is(private.claim_announcements(), 1, 'due scheduled post is claimed');
select is(private.claim_announcements(), 0, 'a second sweep claims nothing');
select is(pg_temp.jobs('announcement'), 2, 'one more push job for the scheduled post');

-- ---------------------------------------------------------------- request pushes
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ua'));
select public.send_request(pg_temp.k('b'), 'Hi Bob');
reset role;
select is((select count(*)::int from pgmq.q_push_jobs where message ->> 'kind' = 'request'
            and message ->> 'user_id' = pg_temp.k('ub')::text), 1, 'new request pushes the recipient');
select is((select message ->> 'body' from pgmq.q_push_jobs where message ->> 'kind' = 'request'), 'Hi Bob', 'with the note');
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ub'));
insert into k select 'conv', public.respond_request((select request_id from public.get_connections(pg_temp.k('e'))
                                                     where direction = 'incoming'), true);
reset role;
select is((select count(*)::int from pgmq.q_push_jobs where message ->> 'kind' = 'accepted'
            and message ->> 'user_id' = pg_temp.k('ua')::text), 1, 'acceptance pushes the original sender');

-- ---------------------------------------------------------------- message pushes and suppression
create function pg_temp.msg_jobs_for(p_user uuid) returns integer language sql as $$
  select count(*)::int from pgmq.q_push_jobs where message ->> 'kind' = 'message' and message ->> 'user_id' = p_user::text;
$$;
-- now() is constant in this transaction, so the test moves the stored timestamps instead of waiting.
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ua'));
select public.send_message(pg_temp.k('conv'), gen_random_uuid(), 'First');
reset role;
select is(pg_temp.msg_jobs_for(pg_temp.k('ub')), 1, 'message pushes a recipient who is not looking');
select is(pg_temp.msg_jobs_for(pg_temp.k('ua')), 0, 'the sender is never pushed');
select isnt((select last_push_at from public.conversation_participants where attendee_id = pg_temp.k('b')), null, 'last_push_at recorded');

set local role authenticated;
select pg_temp.as_user(pg_temp.k('ua'));
select public.send_message(pg_temp.k('conv'), gen_random_uuid(), 'Second');
reset role;
select is(pg_temp.msg_jobs_for(pg_temp.k('ub')), 1, 'at most one push per conversation per 5 minutes');

update public.conversation_participants set last_push_at = now() - interval '6 minutes', last_seen_at = now() - interval '30 seconds'
 where attendee_id = pg_temp.k('b');
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ua'));
select public.send_message(pg_temp.k('conv'), gen_random_uuid(), 'Third');
reset role;
select is(pg_temp.msg_jobs_for(pg_temp.k('ub')), 1, 'no push while the recipient was seen in the chat < 60 s ago');

update public.conversation_participants set last_seen_at = now() - interval '61 seconds' where attendee_id = pg_temp.k('b');
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ua'));
select public.send_message(pg_temp.k('conv'), gen_random_uuid(), 'Fourth');
reset role;
select is(pg_temp.msg_jobs_for(pg_temp.k('ub')), 2, 'push again once seen > 60 s ago and last push > 5 min ago');
select is((select message ->> 'url' from pgmq.q_push_jobs where message ->> 'kind' = 'message' order by msg_id desc limit 1),
          '/chat/' || pg_temp.k('conv'), 'push opens the chat');

-- No subscriptions → no job.
delete from public.push_subscriptions where user_id = pg_temp.k('ua');
update public.conversation_participants set last_push_at = null, last_seen_at = null where attendee_id = pg_temp.k('a');
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ub'));
select public.send_message(pg_temp.k('conv'), gen_random_uuid(), 'Reply');
reset role;
select is(pg_temp.msg_jobs_for(pg_temp.k('ua')), 0, 'no job is queued for someone without subscriptions');

-- ---------------------------------------------------------------- device switching accounts
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ua'));
select lives_ok($$select public.save_push_subscription(pg_temp.k('e'), 'https://push.example/b', 'k2', 'a2')$$,
                'the same device subscribes under another account');
reset role;
select is((select user_id from public.push_subscriptions where endpoint = 'https://push.example/b'), pg_temp.k('ua'),
          'the subscription moves to the new account');
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ua'));
select lives_ok($$select public.remove_push_subscription('https://push.example/b')$$, 'unsubscribe');
reset role;
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/b'), 0, 'subscription removed');

select * from finish();
rollback;
