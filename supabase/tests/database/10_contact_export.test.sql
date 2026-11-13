begin;
select plan(16);

create function pg_temp.mk_attendee(p_event uuid, p_name text)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (v_user, v_user || '@x.test', 'authenticated', 'authenticated', json_build_object('full_name', p_name));
  insert into public.attendees (event_id, user_id, joined_via, completed_at) values (p_event, v_user, 'link', now());
  return v_user;
end $$;
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create temp table k (name text primary key, id uuid);
grant select on k to authenticated;
create function pg_temp.u(p_name text) returns uuid language sql as $$ select id from k where name = p_name $$;
create function pg_temp.att(p_name text) returns uuid language sql as $$ select id from k where name = 'att:' || p_name $$;
create function pg_temp.ev() returns uuid language sql as $$ select id from k where name = 'e' $$;
grant execute on function pg_temp.u(text), pg_temp.att(text), pg_temp.ev() to authenticated;

with x as (insert into public.organizations (name, slug) values ('Org10', 'org-contacts') returning id)
insert into k select 'org', id from x;
with x as (
  insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
  values ((select id from k where name = 'org'), 'contacts-ev', 'Contacts', now(), now() + interval '1 day', 'UTC', 'published', now())
  returning id)
insert into k select 'e', id from x;
insert into k values ('a', pg_temp.mk_attendee(pg_temp.ev(), 'Ann'));   -- the exporter
insert into k values ('b', pg_temp.mk_attendee(pg_temp.ev(), 'Ben'));   -- connected, with a note
insert into k values ('c', pg_temp.mk_attendee(pg_temp.ev(), 'Cat'));   -- pending request only
insert into k values ('d', pg_temp.mk_attendee(pg_temp.ev(), 'Dan'));   -- connected, then blocked
insert into k values ('f', pg_temp.mk_attendee(pg_temp.ev(), 'Fay'));   -- connected, then banned by the organizer
insert into k values ('g', pg_temp.mk_attendee(pg_temp.ev(), 'Gus'));   -- connected, then left the event
insert into k values ('x', gen_random_uuid());                          -- not an attendee
insert into k select 'att:' || u.name, a.id from k u join public.attendees a on a.user_id = u.id;
update public.accounts set headline = 'Staff engineer', company = 'Acme',
                           links = '["https://ben.dev", "https://linkedin.com/in/ben"]'::jsonb
 where user_id = pg_temp.u('b');

insert into public.connection_requests (event_id, from_attendee, to_attendee, status, responded_at)
select pg_temp.ev(), pg_temp.att('a'), pg_temp.att(n), 'accepted', now() from unnest(array['b', 'd', 'f', 'g']) n;
insert into public.connection_requests (event_id, from_attendee, to_attendee) values (pg_temp.ev(), pg_temp.att('c'), pg_temp.att('a'));
insert into public.conversations (event_id, attendee_lo, attendee_hi)
values (pg_temp.ev(), least(pg_temp.att('a'), pg_temp.att('b')), greatest(pg_temp.att('a'), pg_temp.att('b')));
insert into public.blocks (blocker_attendee, blocked_attendee, event_id) values (pg_temp.att('d'), pg_temp.att('a'), pg_temp.ev());
update public.attendees set banned_at = now() where id = pg_temp.att('f');
update public.attendees set left_at = now() where id = pg_temp.att('g');

set local role authenticated;
select pg_temp.as_user(pg_temp.u('a'));
select lives_ok($$select public.save_connection_note(pg_temp.att('b'), 'Send the deck')$$, 'A notes B');

-- ---------------------------------------------------------------- who is in the export
select is((select array_agg(full_name order by full_name) from public.export_contacts(pg_temp.ev())), array['Ben', 'Gus'],
          'accepted connections only: no pending, no blocked (either direction), no banned; left attendees stay');
select is((select headline || ' @ ' || company from public.export_contacts(pg_temp.ev()) where full_name = 'Ben'),
          'Staff engineer @ Acme', 'headline and company');
select is((select links from public.export_contacts(pg_temp.ev()) where full_name = 'Ben'),
          '["https://ben.dev", "https://linkedin.com/in/ben"]'::jsonb, 'profile links are shared with connections');
select is((select note from public.export_contacts(pg_temp.ev()) where full_name = 'Ben'), 'Send the deck', 'own note included');
select ok((select conversation_id is not null from public.export_contacts(pg_temp.ev()) where full_name = 'Ben'), 'chat id included');
select ok((select connected_at is not null from public.export_contacts(pg_temp.ev()) where full_name = 'Gus'), 'connected_at set');

-- Notes are private: B's export of A carries no note (A's note is about B, not by B).
select pg_temp.as_user(pg_temp.u('b'));
select is((select array_agg(full_name) from public.export_contacts(pg_temp.ev())), array['Ann'], 'B sees A');
select is((select note from public.export_contacts(pg_temp.ev())), null, 'B does not get A''s note');

-- The blocked side cannot export the blocker either.
select pg_temp.as_user(pg_temp.u('d'));
select is((select count(*)::int from public.export_contacts(pg_temp.ev())), 0, 'blocked pair hidden for the blocker too');

-- ---------------------------------------------------------------- who may export
select pg_temp.as_user(pg_temp.u('g'));
select is((select array_agg(full_name) from public.export_contacts(pg_temp.ev())), array['Ann'], 'works after leaving the event');
select pg_temp.as_user(pg_temp.u('f'));
select throws_ok($$select * from public.export_contacts(pg_temp.ev())$$, '42501', null, 'banned attendees cannot export');
select pg_temp.as_user(pg_temp.u('x'));
select throws_ok($$select * from public.export_contacts(pg_temp.ev())$$, '42501', null, 'non-attendees cannot export');

reset role;
update public.events set status = 'archived' where id = pg_temp.ev();
set local role authenticated;
select pg_temp.as_user(pg_temp.u('a'));
select is((select count(*)::int from public.export_contacts(pg_temp.ev())), 2, 'works after the event is archived');

reset role;
select ok(not has_function_privilege('anon', 'public.export_contacts(uuid)', 'execute'), 'anon cannot call it');
select ok(has_function_privilege('authenticated', 'public.export_contacts(uuid)', 'execute'), 'authenticated can');

select * from finish();
rollback;
