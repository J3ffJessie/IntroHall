begin;
select plan(9);

-- ---------------------------------------------------------------- setup (as postgres)
create function pg_temp.mk_attendee(p_event uuid, p_name text) returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (v_user, v_user || '@p.test', 'authenticated', 'authenticated', json_build_object('full_name', p_name));
  insert into public.attendees (event_id, user_id, joined_via, completed_at) values (p_event, v_user, 'link', now());
  return v_user;
end $$;
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create temp table k (name text primary key, id uuid);
grant select on k to authenticated;
create function pg_temp.k(p_name text) returns uuid language sql as $$ select id from k where name = p_name $$;
grant execute on function pg_temp.k(text) to authenticated;

with x as (insert into public.organizations (name, slug) values ('Org7', 'org-photos') returning id)
insert into k select 'org', id from x;
with x as (
  insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
  values (pg_temp.k('org'), 'photos-ev', 'Photos', now(), now() + interval '1 day', 'UTC', 'published', now())
  returning id)
insert into k select 'e', id from x;
insert into k values ('a', pg_temp.mk_attendee(pg_temp.k('e'), 'Ann'));
insert into k values ('b', pg_temp.mk_attendee(pg_temp.k('e'), 'Ben'));

-- ---------------------------------------------------------------- avatar_path stays in the owner's folder
set local role authenticated;
select pg_temp.as_user(pg_temp.k('b'));
select lives_ok(format($$update public.accounts set avatar_path = %L where user_id = %L$$,
                       pg_temp.k('b') || '/0123456789abcdef0123456789abcdef.jpg', pg_temp.k('b')),
                'a user can point avatar_path at their own folder');
select throws_ok(format($$update public.accounts set avatar_path = %L where user_id = %L$$,
                        pg_temp.k('a') || '/0123456789abcdef0123456789abcdef.jpg', pg_temp.k('b')),
                 '23514', null, 'pointing at another user''s photo is rejected');
select throws_ok(format($$update public.accounts set avatar_path = %L where user_id = %L$$,
                        pg_temp.k('b') || '/../' || pg_temp.k('a') || '/x.jpg', pg_temp.k('b')),
                 '23514', null, 'path traversal out of the folder is rejected');
select lives_ok(format($$update public.accounts set avatar_path = null where user_id = %L$$, pg_temp.k('b')),
                'the photo can be removed');
select lives_ok(format($$update public.accounts set avatar_path = %L where user_id = %L$$,
                       pg_temp.k('b') || '/0123456789abcdef0123456789abcdef.jpg', pg_temp.k('b')),
                'and set again');

-- ---------------------------------------------------------------- inbox and chat return the partner's photo
select pg_temp.as_user(pg_temp.k('a'));
select is(public.send_request((select attendee_id from public.get_matches(pg_temp.k('e'), 'everyone') where full_name = 'Ben')), 'sent',
          'A requests B');
select is((select avatar_path from public.get_connections(pg_temp.k('e'))),
          pg_temp.k('b') || '/0123456789abcdef0123456789abcdef.jpg', 'get_connections returns the partner''s photo');
select pg_temp.as_user(pg_temp.k('b'));
select isnt(public.respond_request((select request_id from public.get_connections(pg_temp.k('e'))), true), null,
            'B accepts');
select pg_temp.as_user(pg_temp.k('a'));
select is((select avatar_path from public.get_conversations(pg_temp.k('e'))),
          pg_temp.k('b') || '/0123456789abcdef0123456789abcdef.jpg', 'get_conversations returns the partner''s photo');

select * from finish();
rollback;
