begin;
select plan(17);

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.role_of(p_org uuid, p_user uuid) returns text language sql as $$
  select role from public.org_members where org_id = p_org and user_id = p_user
$$;
create temp table k (name text primary key, id uuid);
grant select on k to authenticated;
create function pg_temp.k(p text) returns uuid language sql as $$ select id from k where name = p $$;
grant execute on function pg_temp.k(text), pg_temp.role_of(uuid, uuid) to authenticated;

-- Owner O; admin A; staff S; suspended staff X; outsider Z; B already owns five organizations.
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('14000000-0000-0000-0000-000000000000', 'o14@test.dev', 'authenticated', 'authenticated', '{"full_name":"Olga"}'),
  ('14000000-0000-0000-0000-000000000001', 'a14@test.dev', 'authenticated', 'authenticated', '{"full_name":"Ada"}'),
  ('14000000-0000-0000-0000-000000000002', 's14@test.dev', 'authenticated', 'authenticated', '{"full_name":"Sam"}'),
  ('14000000-0000-0000-0000-000000000003', 'x14@test.dev', 'authenticated', 'authenticated', '{"full_name":"Xan"}'),
  ('14000000-0000-0000-0000-000000000004', 'z14@test.dev', 'authenticated', 'authenticated', '{"full_name":"Zed"}'),
  ('14000000-0000-0000-0000-000000000005', 'b14@test.dev', 'authenticated', 'authenticated', '{"full_name":"Bea"}');
insert into k values ('o', '14000000-0000-0000-0000-000000000000'), ('a', '14000000-0000-0000-0000-000000000001'),
                     ('s', '14000000-0000-0000-0000-000000000002'), ('x', '14000000-0000-0000-0000-000000000003'),
                     ('z', '14000000-0000-0000-0000-000000000004'), ('b', '14000000-0000-0000-0000-000000000005');
update auth.users set banned_until = 'infinity' where id = pg_temp.k('x');

with org as (insert into public.organizations (name, slug) values ('Org14', 'org-transfer') returning id)
insert into k select 'org', id from org;
insert into public.org_members (org_id, user_id, role) values
  (pg_temp.k('org'), pg_temp.k('o'), 'owner'), (pg_temp.k('org'), pg_temp.k('a'), 'admin'),
  (pg_temp.k('org'), pg_temp.k('s'), 'staff'), (pg_temp.k('org'), pg_temp.k('x'), 'staff'),
  (pg_temp.k('org'), pg_temp.k('b'), 'staff');
with orgs as (insert into public.organizations (name, slug)
              select 'B' || g, 'org-b14-' || g from generate_series(1, 5) g returning id)
insert into public.org_members (org_id, user_id, role) select id, pg_temp.k('b'), 'owner' from orgs;

set local role authenticated;

-- ---------------------------------------------------------------- who may transfer
select pg_temp.as_user(pg_temp.k('a'));
select throws_ok($$select public.transfer_org_ownership(pg_temp.k('org'), pg_temp.k('s'))$$, '42501',
                 'only owners can transfer an organization', 'admins cannot transfer');
select pg_temp.as_user(pg_temp.k('z'));
select throws_ok($$select public.transfer_org_ownership(pg_temp.k('org'), pg_temp.k('z'))$$, '42501', null,
                 'outsiders cannot take an organization');

-- ---------------------------------------------------------------- to whom
select pg_temp.as_user(pg_temp.k('o'));
select throws_ok($$select public.transfer_org_ownership(pg_temp.k('org'), pg_temp.k('o'))$$, 'P0001',
                 'you already own this organization', 'not to yourself');
select throws_ok($$select public.transfer_org_ownership(pg_temp.k('org'), pg_temp.k('z'))$$, 'P0001',
                 'pick someone on the team', 'only to a team member');
select throws_ok($$select public.transfer_org_ownership(pg_temp.k('org'), pg_temp.k('x'))$$, 'P0001',
                 'pick someone on the team', 'not to a suspended account');
select throws_ok($$select public.transfer_org_ownership(pg_temp.k('org'), pg_temp.k('b'))$$, 'P0001',
                 'they already own the maximum of 5 organizations', 'respects the 5-organization cap');
select is(pg_temp.role_of(pg_temp.k('org'), pg_temp.k('o')), 'owner', 'failed attempts change nothing');

-- ---------------------------------------------------------------- the transfer
select lives_ok($$select public.transfer_org_ownership(pg_temp.k('org'), pg_temp.k('s'))$$, 'owner transfers to staff');
select is(pg_temp.role_of(pg_temp.k('org'), pg_temp.k('s')), 'owner', 'staff member is now the owner');
select is(pg_temp.role_of(pg_temp.k('org'), pg_temp.k('o')), 'admin', 'the previous owner stays on as admin');
select is((select count(*)::int from public.org_members where org_id = pg_temp.k('org') and role = 'owner'), 1,
          'still exactly one owner');
select throws_ok($$select public.transfer_org_ownership(pg_temp.k('org'), pg_temp.k('a'))$$, '42501', null,
                 'the previous owner can no longer transfer');

-- The new owner has every owner power.
select pg_temp.as_user(pg_temp.k('s'));
select lives_ok($$select public.remove_org_member(pg_temp.k('org'), pg_temp.k('o'))$$,
                'the new owner can remove the previous owner');
select lives_ok($$select public.transfer_org_ownership(pg_temp.k('org'), pg_temp.k('a'))$$, 'and transfer again');
select is(pg_temp.role_of(pg_temp.k('org'), pg_temp.k('a')), 'owner', 'ownership moved on');

-- Account deletion: the previous owner is no longer blocked.
select pg_temp.as_user(pg_temp.k('s'));
select is((select count(*)::int from public.account_deletion_blockers()), 0,
          'a former only owner can delete their account');

reset role;
select ok(not has_function_privilege('anon', 'public.transfer_org_ownership(uuid, uuid)', 'execute'),
          'anon cannot call transfer_org_ownership');

select * from finish();
rollback;
