begin;
select plan(14);

-- private schema is unreachable for anon and has no callable functions for API roles.
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon has no usage on private');
select ok(not has_schema_privilege('authenticated', 'private', 'create'),
          'authenticated cannot create objects in private');
-- authenticated may execute only the read-only helpers that RLS policies call (§3.1).
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and (has_function_privilege('anon', p.oid, 'execute')
           or (has_function_privilege('authenticated', p.oid, 'execute')
               and p.proname not in ('my_org_ids', 'my_admin_org_ids', 'my_org_event_ids',
                                     'my_event_ids', 'my_attendee_ids',
                                     'my_blocked_attendee_ids', 'my_conversation_ids',
                                     'is_valid_slug', 'normalize_tag')))),
  '{}'::text[],
  'no private.* function is executable by anon, and authenticated only gets policy helpers');

-- Seed two users; the signup trigger creates their accounts.
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('11111111-1111-1111-1111-111111111111', 'a@test.dev', '{"full_name":"Ada"}', 'authenticated', 'authenticated'),
       ('22222222-2222-2222-2222-222222222222', 'b@test.dev', '{}', 'authenticated', 'authenticated');

select is((select full_name from public.accounts where user_id = '11111111-1111-1111-1111-111111111111'),
          'Ada', 'signup trigger creates account with OAuth name');
select is((select count(*)::int from public.accounts
            where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
          2, 'one account per signup');

-- anon sees nothing.
set local role anon;
select throws_ok('select * from public.accounts', '42501', null, 'anon cannot read accounts');
reset role;

-- authenticated as A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.accounts), 1, 'A sees only own account');
select lives_ok($$update public.accounts set headline = 'Builder' where user_id = auth.uid()$$,
                'A updates own headline');
select is((select headline from public.accounts), 'Builder', 'headline persisted');

update public.accounts set headline = 'pwned' where user_id = '22222222-2222-2222-2222-222222222222';
select throws_ok($$update public.accounts set user_id = gen_random_uuid() where user_id = auth.uid()$$,
                 '42501', null, 'A cannot change user_id');
select throws_ok($$update public.accounts set deleted_at = now() where user_id = auth.uid()$$,
                 '42501', null, 'A cannot set deleted_at');
select throws_ok($$insert into public.accounts (user_id) values (gen_random_uuid())$$,
                 '42501', null, 'A cannot insert accounts');
select throws_ok($$delete from public.accounts$$, '42501', null, 'A cannot delete accounts');
reset role;

select is((select headline from public.accounts where user_id = '22222222-2222-2222-2222-222222222222'),
          '', 'B''s account untouched by A');

select * from finish();
rollback;
