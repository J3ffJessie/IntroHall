begin;
select plan(8);

-- Owner has a name; New signed up by email code (no name yet); Inv was invited and has no name either.
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('12000000-0000-0000-0000-000000000001', 'owner@p12.test', 'authenticated', 'authenticated', '{"full_name":"Olga Owner"}'),
  ('12000000-0000-0000-0000-000000000002', 'new@p12.test',   'authenticated', 'authenticated', '{}'),
  ('12000000-0000-0000-0000-000000000003', 'inv@p12.test',   'authenticated', 'authenticated', '{}');

create function pg_temp.as_user(p_id uuid, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', p_id, 'role', 'authenticated', 'email', p_email)::text, true);
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------- creating an organization
select pg_temp.as_user('12000000-0000-0000-0000-000000000002', 'new@p12.test');
select throws_ok($$select public.create_organization('Nameless Org', 'nameless-org')$$, 'P0001',
                 'add your name to your profile first', 'no organization without a name');
select is((select count(*)::int from public.organizations where slug = 'nameless-org'), 0, 'nothing was created');
update public.accounts set full_name = '   ' where user_id = '12000000-0000-0000-0000-000000000002';
select throws_ok($$select public.create_organization('Nameless Org', 'nameless-org')$$, 'P0001', null,
                 'a blank name does not count');
update public.accounts set full_name = 'Nia New' where user_id = '12000000-0000-0000-0000-000000000002';
select lives_ok($$insert into ids values ('org_new', public.create_organization('Named Org', 'named-org'))$$,
                'works once the profile has a name');

-- ---------------------------------------------------------------- accepting an invite
select pg_temp.as_user('12000000-0000-0000-0000-000000000001', 'owner@p12.test');
insert into ids values ('org', public.create_organization('Owner Org', 'owner-org-p12'));
insert into ids values ('invite', public.create_invite((select v::uuid from ids where k = 'org'), 'inv@p12.test', 'staff'));

select pg_temp.as_user('12000000-0000-0000-0000-000000000003', 'inv@p12.test');
select throws_ok($$select public.accept_invite((select v from ids where k = 'invite'))$$, 'P0001',
                 'add your name to your profile first', 'no joining a team without a name');
update public.accounts set full_name = 'Ivo Invited' where user_id = '12000000-0000-0000-0000-000000000003';
select is(public.accept_invite((select v from ids where k = 'invite')), (select v::uuid from ids where k = 'org'),
          'the same invite works after adding a name');

-- ---------------------------------------------------------------- seeding is unaffected
reset role;
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, email, aud, role) values
  ('12000000-0000-0000-0000-000000000004', 'seed@p12.test', 'authenticated', 'authenticated');
select lives_ok($$insert into public.org_members (org_id, user_id, role)
                  values ((select v::uuid from ids where k = 'org'), '12000000-0000-0000-0000-000000000004', 'staff')$$,
                'SQL / service-role inserts are not blocked');
select is((select count(*)::int from public.org_members where org_id = (select v::uuid from ids where k = 'org')), 3,
          'owner, invited member and seeded member');

select * from finish();
rollback;
