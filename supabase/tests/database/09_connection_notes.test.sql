begin;
select plan(17);

create function pg_temp.mk_attendee(p_event uuid, p_name text)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (v_user, v_user || '@n.test', 'authenticated', 'authenticated', json_build_object('full_name', p_name));
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
grant execute on function pg_temp.u(text), pg_temp.att(text) to authenticated;

with x as (insert into public.organizations (name, slug) values ('Org9', 'org-notes') returning id)
insert into k select 'org', id from x;
with x as (
  insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
  values ((select id from k where name = 'org'), 'notes-ev', 'Notes', now(), now() + interval '1 day', 'UTC', 'published', now())
  returning id)
insert into k select 'e', id from x;
insert into k values ('a', pg_temp.mk_attendee((select id from k where name = 'e'), 'Ann'));
insert into k values ('b', pg_temp.mk_attendee((select id from k where name = 'e'), 'Ben'));
insert into k values ('c', pg_temp.mk_attendee((select id from k where name = 'e'), 'Cat'));
insert into k select 'att:' || u.name, a.id from k u join public.attendees a on a.user_id = u.id;

set local role authenticated;
-- A and B connect; C only has a pending request to A.
select pg_temp.as_user(pg_temp.u('a'));
select is(public.send_request(pg_temp.att('b')), 'sent', 'A requests B');
select pg_temp.as_user(pg_temp.u('b'));
select is(public.send_request(pg_temp.att('a')), 'connected', 'B asks back: connected');
select pg_temp.as_user(pg_temp.u('c'));
select is(public.send_request(pg_temp.att('a')), 'sent', 'C requests A');

-- ---------------------------------------------------------------- writing
select pg_temp.as_user(pg_temp.u('a'));
select lives_ok($$select public.save_connection_note(pg_temp.att('b'), '  Talked RAG evals, send deck  ')$$, 'A notes B');
select is((select body from public.connection_notes where about_attendee = pg_temp.att('b')), 'Talked RAG evals, send deck',
          'note is trimmed and readable by its author');
select lives_ok($$select public.save_connection_note(pg_temp.att('b'), 'Send deck by Friday')$$, 'A edits the note');
select is((select count(*)::int from public.connection_notes), 1, 'still one note per person');
select is((select body from public.connection_notes), 'Send deck by Friday', 'edit replaced the body');
select throws_ok($$select public.save_connection_note(pg_temp.att('c'), 'pending only')$$, '42501', null,
                 'no notes on someone you are not connected with');
select throws_ok($$select public.save_connection_note(pg_temp.att('a'), 'me')$$, '42501', null, 'no notes on yourself');
select throws_ok($$select public.save_connection_note(pg_temp.att('b'), repeat('x', 2001))$$, 'P0001', null, 'max 2000 chars');
select throws_ok($$insert into public.connection_notes (owner_attendee, about_attendee, event_id, body)
                   values (pg_temp.att('a'), pg_temp.att('c'), (select id from k where name = 'e'), 'x')$$,
                 '42501', null, 'no direct writes');

-- ---------------------------------------------------------------- privacy
select pg_temp.as_user(pg_temp.u('b'));
select is((select count(*)::int from public.connection_notes), 0, 'B cannot read A''s note about B');

select pg_temp.as_user(pg_temp.u('a'));
select is((public.export_my_data() -> 'connection_notes' -> 0 ->> 'body'), 'Send deck by Friday', 'export includes notes');
select ok(public.export_my_data() ? 'attendees', 'export still has everything else');

select lives_ok($$select public.save_connection_note(pg_temp.att('b'), '   ')$$, 'A clears the note');
select is((select count(*)::int from public.connection_notes), 0, 'clearing deletes it');

select * from finish();
rollback;
