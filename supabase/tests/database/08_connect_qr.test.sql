begin;
select plan(27);

-- ---------------------------------------------------------------- helpers (run as postgres)
create function pg_temp.mk_attendee(p_event uuid, p_name text, p_visible boolean default true, p_completed boolean default true)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (v_user, v_user || '@q.test', 'authenticated', 'authenticated', json_build_object('full_name', p_name));
  insert into public.attendees (event_id, user_id, joined_via, completed_at, visibility)
  values (p_event, v_user, 'link', case when p_completed then now() end, case when p_visible then 'visible' else 'hidden' end);
  return v_user;
end $$;
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create temp table k (name text primary key, id uuid);
create temp table tok (name text primary key, token text);
grant select, insert, update on k, tok to authenticated;
create function pg_temp.u(p_name text) returns uuid language sql as $$ select id from k where name = p_name $$;
create function pg_temp.att(p_name text) returns uuid language sql as $$ select id from k where name = 'att:' || p_name $$;
create function pg_temp.tok(p_name text) returns text language sql as $$ select token from tok where name = p_name $$;
grant execute on function pg_temp.u(text), pg_temp.att(text), pg_temp.tok(text) to authenticated;

with x as (insert into public.organizations (name, slug) values ('Org8', 'org-qr') returning id)
insert into k select 'org', id from x;
with x as (
  insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
  values ((select id from k where name = 'org'), 'qr-ev', 'QR', now(), now() + interval '1 day', 'UTC', 'published', now())
  returning id)
insert into k select 'e', id from x;
with x as (
  insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
  values ((select id from k where name = 'org'), 'qr-other', 'QR other', now(), now() + interval '1 day', 'UTC', 'published', now())
  returning id)
insert into k select 'e_other', id from x;

insert into k values ('a', pg_temp.mk_attendee((select id from k where name = 'e'), 'Ann Lee'));
insert into k values ('b', pg_temp.mk_attendee((select id from k where name = 'e'), 'Ben'));
insert into k values ('c', pg_temp.mk_attendee((select id from k where name = 'e'), 'Cat'));
insert into k values ('hid', pg_temp.mk_attendee((select id from k where name = 'e'), 'Hidden', false));
insert into k values ('inc', pg_temp.mk_attendee((select id from k where name = 'e'), 'Incomplete', true, false));
insert into k values ('x', pg_temp.mk_attendee((select id from k where name = 'e_other'), 'Xavier'));
insert into k
select 'att:' || u.name, a.id from k u join public.attendees a on a.user_id = u.id
 where a.event_id = (select id from k where name = 'e');

-- Ann has push on, so her "X connected with you" job is queued (enqueue_push skips unsubscribed users).
with s as (insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
           values (pg_temp.u('a'), 'https://push.example/qr-a', 'k', 'a') returning id)
insert into public.push_subscription_events (subscription_id, event_id) select id, (select id from k where name = 'e') from s;

-- ---------------------------------------------------------------- tokens
set local role authenticated;
select throws_ok($$select * from public.connect_tokens$$, '42501', null, 'token table not readable directly');

select pg_temp.as_user(pg_temp.u('a'));
insert into tok values ('a', public.get_connect_token((select id from k where name = 'e')));
select ok(char_length(pg_temp.tok('a')) = 24 and pg_temp.tok('a') ~ '^[A-Za-z0-9_-]+$', 'token is 24 URL-safe chars');
select is(public.get_connect_token((select id from k where name = 'e')), pg_temp.tok('a'), 'token is stable');
select throws_ok($$select public.get_connect_token((select id from k where name = 'e_other'))$$, '42501', null,
                 'no token for an event you are not at');

select pg_temp.as_user(pg_temp.u('inc'));
select throws_ok($$select public.get_connect_token((select id from k where name = 'e'))$$, '42501', null,
                 'no token before finishing your profile');

select pg_temp.as_user(pg_temp.u('hid'));
insert into tok values ('hid', public.get_connect_token((select id from k where name = 'e')));

-- ---------------------------------------------------------------- preview
select pg_temp.as_user(pg_temp.u('b'));
select is((select full_name || '|' || state from public.preview_connect_token(pg_temp.tok('a'))), 'Ann Lee|available',
          'B previews A''s code');
select is((select count(*)::int from public.preview_connect_token('nope')), 0, 'unknown code previews nothing');
select pg_temp.as_user(pg_temp.u('x'));
select is((select count(*)::int from public.preview_connect_token(pg_temp.tok('a'))), 0,
          'someone at another event learns nothing');
select throws_ok($$select public.connect_by_token(pg_temp.tok('a'))$$, '42501', null, 'and cannot connect');
select pg_temp.as_user(pg_temp.u('a'));
select is((select state from public.preview_connect_token(pg_temp.tok('a'))), 'self', 'own code previews as self');
select throws_ok($$select public.connect_by_token(pg_temp.tok('a'))$$, 'P0001', null, 'cannot connect with yourself');

-- ---------------------------------------------------------------- connect (no prior request)
select pg_temp.as_user(pg_temp.u('b'));
insert into k values ('conv_ab', public.connect_by_token(pg_temp.tok('a')));
select isnt(pg_temp.u('conv_ab'), null, 'B connects by scanning A');
select is((select direction || ':' || status from public.get_connections((select id from k where name = 'e'))
            where other_attendee = pg_temp.att('a')), 'outgoing:accepted', 'B is connected with A');
select is((select count(*)::int from public.conversation_participants where conversation_id = pg_temp.u('conv_ab')), 2,
          'both are in the conversation');
select is(public.connect_by_token(pg_temp.tok('a')), pg_temp.u('conv_ab'), 'scanning again is idempotent');
select is((select state from public.preview_connect_token(pg_temp.tok('a'))), 'connected', 'preview now says connected');

-- ---------------------------------------------------------------- an existing pending request is completed
select pg_temp.as_user(pg_temp.u('c'));
select is(public.send_request(pg_temp.att('a')), 'sent', 'C requests A');
select pg_temp.as_user(pg_temp.u('c'));
select isnt(public.connect_by_token(pg_temp.tok('a')), null, 'C then scans A: connected');
select is((select status from public.get_connections((select id from k where name = 'e'))
            where other_attendee = pg_temp.att('a')), 'accepted', 'the pending request became accepted');

-- ---------------------------------------------------------------- hidden code owner, blocks, rotation
select is((select state from public.preview_connect_token(pg_temp.tok('hid'))), 'available',
          'a hidden profile can still share its code');
select pg_temp.as_user(pg_temp.u('hid'));
select lives_ok($$select public.block_attendee(pg_temp.att('c'))$$, 'Hidden blocks C');
select pg_temp.as_user(pg_temp.u('c'));
select is((select state from public.preview_connect_token(pg_temp.tok('hid'))), 'unavailable', 'blocked pair: unavailable');
select throws_ok($$select public.connect_by_token(pg_temp.tok('hid'))$$, 'P0001', null, 'blocked pair cannot connect');

select pg_temp.as_user(pg_temp.u('hid'));
insert into tok values ('hid_new', public.get_connect_token((select id from k where name = 'e'), true));
select isnt(pg_temp.tok('hid_new'), pg_temp.tok('hid'), 'rotation issues a new code');
select pg_temp.as_user(pg_temp.u('b'));
select is((select count(*)::int from public.preview_connect_token(pg_temp.tok('hid'))), 0, 'the old code stops working');

-- ---------------------------------------------------------------- notifications
reset role;
select is((select count(*)::int from pgmq.q_push_jobs
            where message ->> 'kind' = 'accepted' and message ->> 'user_id' = pg_temp.u('a')::text
              and message ->> 'title' = 'Ben connected with you'), 1, 'A is pushed once that B connected');
select cmp_ok((select count(*)::int from realtime.messages
                where topic = 'user:' || pg_temp.u('a') and event = 'request' and payload ->> 'status' = 'accepted'), '>=', 1,
              'A''s views refresh in realtime');

select * from finish();
rollback;
