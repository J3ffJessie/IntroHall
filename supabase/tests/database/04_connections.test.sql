begin;
select plan(67);

-- ---------------------------------------------------------------- helpers (run as postgres)
create function pg_temp.mk_attendee(p_event uuid, p_name text, p_visible boolean default true, p_completed boolean default true)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (v_user, v_user || '@c.test', 'authenticated', 'authenticated', json_build_object('full_name', p_name));
  insert into public.attendees (event_id, user_id, joined_via, completed_at, visibility)
  values (p_event, v_user, 'link', case when p_completed then now() end, case when p_visible then 'visible' else 'hidden' end);
  return v_user;
end $$;

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.topic(p_topic text) returns void language sql as $$
  select set_config('realtime.topic', p_topic, true);
$$;

create temp table k (name text primary key, id uuid);
grant select, insert on k to authenticated;
create function pg_temp.u(p_name text) returns uuid language sql as $$ select id from k where name = p_name $$;
-- Attendee id of a named user in the test event (resolved at setup, not under the caller's RLS).
create function pg_temp.att(p_name text) returns uuid language sql as $$
  select id from k where name = 'att:' || p_name;
$$;
grant execute on function pg_temp.u(text), pg_temp.att(text) to authenticated;

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000f0', 'org4@test.dev', 'authenticated', 'authenticated', '{"full_name":"Orla"}');
insert into k values ('org_user', '00000000-0000-0000-0000-0000000000f0');
with x as (insert into public.organizations (name, slug) values ('Org4', 'org-phase4') returning id)
insert into k select 'org', id from x;
insert into public.org_members values ((select id from k where name = 'org'), pg_temp.u('org_user'), 'owner');
with x as (
  insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
  values ((select id from k where name = 'org'), 'phase4-ev', 'P4', now(), now() + interval '1 day', 'UTC', 'published', now())
  returning id)
insert into k select 'e', id from x;
with x as (
  insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
  values ((select id from k where name = 'org'), 'phase4-other', 'P4 other', now(), now() + interval '1 day', 'UTC', 'published', now())
  returning id)
insert into k select 'e_other', id from x;

insert into k values ('a', pg_temp.mk_attendee((select id from k where name = 'e'), 'Ann'));
insert into k values ('b', pg_temp.mk_attendee((select id from k where name = 'e'), 'Ben'));
insert into k values ('c', pg_temp.mk_attendee((select id from k where name = 'e'), 'Cat'));
insert into k values ('hid', pg_temp.mk_attendee((select id from k where name = 'e'), 'Hidden', false));
insert into k values ('inc', pg_temp.mk_attendee((select id from k where name = 'e'), 'Incomplete', true, false));
insert into k values ('x', pg_temp.mk_attendee((select id from k where name = 'e_other'), 'Xavier'));
-- 22 extra people for the pending-request limit.
insert into k select 'p' || i, pg_temp.mk_attendee((select id from k where name = 'e'), 'P' || i) from generate_series(1, 22) i;

insert into k
select 'att:' || u.name, a.id from k u join public.attendees a on a.user_id = u.id
 where a.event_id = (select id from k where name = 'e');

-- ---------------------------------------------------------------- requests
set local role authenticated;
select pg_temp.as_user(pg_temp.u('a'));
select is(public.send_request(pg_temp.att('b'), 'Hi Ben, love your Rust talk'), 'sent', 'A requests B');
select is(public.send_request(pg_temp.att('b')), 'already_pending', 'duplicate request is a no-op');
select throws_ok($$select public.send_request(pg_temp.att('a'))$$, 'P0001', null, 'cannot request yourself');
select throws_ok($$select public.send_request(pg_temp.att('hid'))$$, 'P0001', null, 'cannot request a hidden attendee');
select throws_ok($$select public.send_request(pg_temp.att('inc'))$$, 'P0001', null, 'cannot request an incomplete profile');
select throws_ok($$select public.send_request((select a.id from public.attendees a where a.user_id = pg_temp.u('x')))$$,
                 '42501', null, 'cannot request someone at another event');
select throws_ok($$select public.send_request(pg_temp.att('b'), repeat('x', 281))$$, 'P0001', null, 'note max 280');
select throws_ok($$select * from public.connection_requests$$, '42501', null, 'requests table not readable directly');

select is((select direction || ':' || status from public.get_connections((select id from k where name = 'e'))
            where other_attendee = pg_temp.att('b')), 'outgoing:pending', 'A sees outgoing pending');
select pg_temp.as_user(pg_temp.u('b'));
select is((select note from public.get_connections((select id from k where name = 'e'))
            where direction = 'incoming' and other_attendee = pg_temp.att('a')),
          'Hi Ben, love your Rust talk', 'B sees incoming request with note');

-- Silent decline: B declines; A still sees pending, but A's quota is freed.
select is(public.respond_request((select request_id from public.get_connections((select id from k where name = 'e'))
                                   where other_attendee = pg_temp.att('a')), false), null, 'B declines A');
select is((select count(*)::int from public.get_connections((select id from k where name = 'e'))
            where other_attendee = pg_temp.att('a')), 0, 'declined request disappears for the recipient');
select pg_temp.as_user(pg_temp.u('a'));
select is((select status from public.get_connections((select id from k where name = 'e'))
            where other_attendee = pg_temp.att('b')), 'pending', 'decline is silent: sender still sees pending');

-- Pending limit: 20 pending → the 21st is rejected; a decline frees a slot.
select lives_ok($$select public.send_request(pg_temp.att('p' || i)) from generate_series(1, 20) i$$, 'A sends 20 more requests');
select throws_ok($$select public.send_request(pg_temp.att('p21'))$$, 'P0001', null, '21st pending request rejected');
select pg_temp.as_user(pg_temp.u('p1'));
select public.respond_request((select request_id from public.get_connections((select id from k where name = 'e'))
                                where other_attendee = pg_temp.att('a')), false);
select pg_temp.as_user(pg_temp.u('a'));
select is(public.send_request(pg_temp.att('p21')), 'sent', 'after a decline the sender has quota again');
select lives_ok($$select public.withdraw_request((select request_id from public.get_connections((select id from k where name = 'e'))
                                                   where other_attendee = pg_temp.att('p21')))$$, 'A withdraws a request');

-- ---------------------------------------------------------------- accept → conversation
select pg_temp.as_user(pg_temp.u('c'));
select is(public.send_request(pg_temp.att('b'), 'Coffee?'), 'sent', 'C requests B');
select pg_temp.as_user(pg_temp.u('b'));
insert into k select 'conv', public.respond_request((select request_id from public.get_connections((select id from k where name = 'e'))
                                                     where other_attendee = pg_temp.att('c')), true);
select isnt((select id from k where name = 'conv'), null, 'accept returns the conversation');
select is((select count(*)::int from public.conversation_participants where conversation_id = (select id from k where name = 'conv')), 2,
          'two participants');
select throws_ok($$select public.respond_request((select request_id from public.get_connections((select id from k where name = 'e'))
                                                   where other_attendee = pg_temp.att('c')), true)$$,
                 'P0001', null, 'cannot respond twice');
select pg_temp.as_user(pg_temp.u('p2'));
select is(public.send_request(pg_temp.att('a')), 'connected', 'requesting someone who already asked you auto-accepts');

-- ---------------------------------------------------------------- messages
select pg_temp.as_user(pg_temp.u('c'));
select is((select body from public.send_message((select id from k where name = 'conv'), '00000000-0000-4000-8000-000000000001', '  Hello Ben  ')),
          'Hello Ben', 'C sends a message (trimmed)');
select is((select id from public.send_message((select id from k where name = 'conv'), '00000000-0000-4000-8000-000000000001', 'Hello Ben')),
          (select id from public.messages where client_msg_id = '00000000-0000-4000-8000-000000000001'),
          'retried send_message returns the original row id');
select is((select count(*)::int from public.messages where conversation_id = (select id from k where name = 'conv')), 1,
          'retry did not duplicate');
select throws_ok($$select public.send_message((select id from k where name = 'conv'), gen_random_uuid(), '   ')$$,
                 'P0001', null, 'empty message rejected');
select throws_ok($$insert into public.messages (conversation_id, sender_attendee, client_msg_id, body)
                   values ((select id from k where name = 'conv'), pg_temp.att('c'), gen_random_uuid(), 'x')$$,
                 '42501', null, 'messages cannot be inserted directly');
select pg_temp.as_user(pg_temp.u('b'));
insert into k select 'msg_b', id from public.send_message((select id from k where name = 'conv'), gen_random_uuid(), 'You are awful');
select is((select count(*)::int from public.messages where conversation_id = (select id from k where name = 'conv')), 2,
          'B reads both messages');
select is((select unread from public.get_conversations((select id from k where name = 'e'))), 0, 'own sends are not unread');
-- now() is fixed inside this test transaction; backdate C's last read so B's message is newer.
reset role;
update public.conversation_participants set last_read_at = now() - interval '1 minute' where attendee_id = pg_temp.att('c');
set local role authenticated;
select pg_temp.as_user(pg_temp.u('c'));
select is((select unread from public.get_conversations((select id from k where name = 'e'))), 1, 'C has 1 unread');
select public.touch_conversation((select id from k where name = 'conv'));
select is((select unread from public.get_conversations((select id from k where name = 'e'))), 0, 'heartbeat marks read');

-- A third user cannot read the conversation or send into it.
select pg_temp.as_user(pg_temp.u('a'));
select is((select count(*)::int from public.conversations where id = (select id from k where name = 'conv')), 0, 'third user: no conversation row');
select is((select count(*)::int from public.messages where conversation_id = (select id from k where name = 'conv')), 0, 'third user: no messages');
select throws_ok($$select public.send_message((select id from k where name = 'conv'), gen_random_uuid(), 'hi')$$,
                 '42501', null, 'third user cannot send');

-- Rate limit: 30 messages per minute per sender.
reset role;
insert into public.messages (conversation_id, sender_attendee, client_msg_id, body)
select (select id from k where name = 'conv'), pg_temp.att('c'), gen_random_uuid(), 'spam' from generate_series(1, 29);
set local role authenticated;
select pg_temp.as_user(pg_temp.u('c'));
select throws_ok($$select public.send_message((select id from k where name = 'conv'), gen_random_uuid(), 'one too many')$$,
                 'P0001', null, '31st message in a minute rejected');
select lives_ok($$select public.send_message((select id from k where name = 'conv'), '00000000-0000-4000-8000-000000000001', 'Hello Ben')$$,
                'a retry still succeeds while rate-limited');

-- ---------------------------------------------------------------- realtime (R7)
reset role;
select cmp_ok((select count(*)::int from realtime.messages
                where topic = 'user:' || pg_temp.u('b') and event = 'message'), '>=', 1, 'message broadcast to recipient topic');
select cmp_ok((select count(*)::int from realtime.messages
                where topic = 'user:' || pg_temp.u('c') and event = 'message'), '>=', 1, 'and to the sender''s own topic');
select cmp_ok((select count(*)::int from realtime.messages
                where topic = 'user:' || pg_temp.u('b') and event = 'request'), '>=', 1, 'request broadcast to recipient');
set local role authenticated;
select pg_temp.as_user(pg_temp.u('b'));
select pg_temp.topic('user:' || pg_temp.u('b'));
select cmp_ok((select count(*)::int from realtime.messages), '>=', 1, 'B may subscribe to user:B');
select pg_temp.as_user(pg_temp.u('a'));
select pg_temp.topic('user:' || pg_temp.u('b'));
select is((select count(*)::int from realtime.messages), 0, 'A cannot subscribe to user:B');
select pg_temp.topic('event:' || (select id from k where name = 'e'));
reset role;
select realtime.send('{"t":1}'::jsonb, 'announcement', 'event:' || (select id from k where name = 'e'), true);
set local role authenticated;
select pg_temp.as_user(pg_temp.u('a'));
select pg_temp.topic('event:' || (select id from k where name = 'e'));
select cmp_ok((select count(*)::int from realtime.messages), '>=', 1, 'attendee may subscribe to event:E');
select pg_temp.as_user((select a.user_id from public.attendees a where a.user_id = pg_temp.u('x')));
select is((select count(*)::int from realtime.messages), 0, 'other event''s attendee cannot subscribe to event:E');
select pg_temp.topic('moderation:' || (select id from k where name = 'e'));
select pg_temp.as_user(pg_temp.u('a'));
select is((select count(*)::int from realtime.messages), 0, 'attendees cannot subscribe to moderation:E');
select throws_ok($$insert into realtime.messages (topic, extension, event, payload, private)
                   values ('event:' || (select id from k where name = 'e'), 'broadcast', 'announcement', '{"fake":true}', true)$$,
                 '42501', null, 'client broadcast to event: is rejected');
select throws_ok($$insert into realtime.messages (topic, extension, event, payload, private)
                   values ('user:' || pg_temp.u('b'), 'broadcast', 'message', '{"fake":true}', true)$$,
                 '42501', null, 'client broadcast to user: is rejected');

-- ---------------------------------------------------------------- report (evidence) then block
select pg_temp.as_user(pg_temp.u('c'));
select throws_ok($$select public.report_attendee(pg_temp.att('b'), 'x', (select id from public.messages limit 1 offset 0))$$,
                 '42501', null, 'cannot report a message the target did not send');
insert into k select 'report', public.report_attendee(pg_temp.att('b'), 'Abusive message', (select id from k where name = 'msg_b'));
select is((select message_snapshot from public.reports where id = (select id from k where name = 'report')), 'You are awful',
          'report stores a snapshot of the message');
select is((select sender_snapshot ->> 'full_name' from public.reports where id = (select id from k where name = 'report')), 'Ben',
          'and of the sender');
reset role;
select cmp_ok((select count(*)::int from realtime.messages where topic = 'moderation:' || (select id from k where name = 'e')
                and event = 'report'), '>=', 1, 'report broadcast to the moderation topic');
set local role authenticated;
select pg_temp.as_user(pg_temp.u('org_user'));
select is((select target_name || ':' || status from public.get_reports((select id from k where name = 'e'))), 'Ben:open',
          'organizer sees the report in the queue');
select is((select count(*)::int from public.messages), 0, 'organizer still cannot read messages');
select pg_temp.as_user(pg_temp.u('a'));
select throws_ok($$select * from public.get_reports((select id from k where name = 'e'))$$, '42501', null, 'attendees cannot read the queue');
select is((select count(*)::int from public.reports), 0, 'A cannot see C''s report');

select pg_temp.as_user(pg_temp.u('c'));
select lives_ok($$select public.block_attendee(pg_temp.att('b'))$$, 'C blocks B');
select is((select read_only_reason from public.conversations where id = (select id from k where name = 'conv')), 'blocked',
          'block makes the conversation read-only');
select throws_ok($$select public.send_message((select id from k where name = 'conv'), gen_random_uuid(), 'hello?')$$,
                 'P0001', null, 'no new messages after a block');
select is((select count(*)::int from public.attendees where id = pg_temp.att('b')), 0, 'C no longer sees B');
select pg_temp.as_user(pg_temp.u('b'));
select is((select count(*)::int from public.attendees where id = pg_temp.att('c')), 0, 'B no longer sees C (both directions)');
select is((select count(*)::int from public.get_matches((select id from k where name = 'e'), 'everyone', null, 100)
            where attendee_id = pg_temp.att('c')), 0, 'blocked attendee excluded from matching');
select throws_ok($$select public.send_request(pg_temp.att('c'))$$, 'P0001', null, 'cannot request someone who blocked you');

-- ---------------------------------------------------------------- retention keeps reported messages
reset role;
update public.events set ends_at = now() - interval '31 days', starts_at = now() - interval '32 days'
 where id = (select id from k where name = 'e');
select private.purge_expired_messages();
select is((select array_agg(body) from public.messages where conversation_id = (select id from k where name = 'conv')),
          array['You are awful'], 'retention deletes old messages except one under an open report');
set local role authenticated;
select pg_temp.as_user(pg_temp.u('org_user'));
select lives_ok($$select public.resolve_report((select id from k where name = 'report'), 'Warned the attendee')$$, 'organizer resolves');
reset role;
select private.purge_expired_messages();
select is((select count(*)::int from public.messages where conversation_id = (select id from k where name = 'conv')), 0,
          'once resolved, retention deletes it');
select is((select message_snapshot from public.reports where id = (select id from k where name = 'report')), 'You are awful',
          'the report keeps its snapshot');

-- ---------------------------------------------------------------- leaving withdraws and freezes
update public.events set ends_at = now() + interval '1 day', starts_at = now() where id = (select id from k where name = 'e');
set local role authenticated;
select pg_temp.as_user(pg_temp.u('a'));
select public.leave_event((select id from k where name = 'e'));
reset role;
select is((select count(*)::int from public.connection_requests where from_attendee = pg_temp.att('a') and status = 'pending'), 0,
          'leaving withdraws pending requests');
select is((select read_only_reason from public.conversations c
            where pg_temp.att('a') in (c.attendee_lo, c.attendee_hi)), 'left', 'leaving freezes conversations');

select * from finish();
rollback;
