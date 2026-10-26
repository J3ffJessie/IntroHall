begin;
select plan(52);

-- Users: A owns org A, B owns org B, C is invited to org A.
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.dev', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.dev', 'authenticated', 'authenticated'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@test.dev', 'authenticated', 'authenticated');

create function pg_temp.as_user(p_id uuid, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', p_id, 'role', 'authenticated', 'email', p_email)::text, true);
$$;

create temp table ids (k text primary key, v text);
grant all on ids to anon, authenticated;

-- ---------------------------------------------------------------- setup as A
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.dev');

insert into ids values ('org_a', public.create_organization('Org A', 'org-a'));
select is((select role from public.org_members), 'owner', 'creator becomes owner');

insert into public.events (org_id, slug, name, starts_at, ends_at, timezone)
values ((select v::uuid from ids where k = 'org_a'), 'conf-a', 'Conf A',
        '2026-11-03 09:00+00', '2026-11-04 18:00+00', 'America/New_York');
insert into ids select 'event_a', id::text from public.events where slug = 'conf-a';

insert into public.interest_tags (event_id, label)
values ((select v::uuid from ids where k = 'event_a'), '  Machine   Learning');
select is((select normalized from public.interest_tags where event_id = (select v::uuid from ids where k = 'event_a')), 'machine learning', 'tag label normalized');
select is((select is_official from public.interest_tags where event_id = (select v::uuid from ids where k = 'event_a')), true, 'organizer tags are official');
select throws_ok(
  $$insert into public.interest_tags (event_id, label) values ((select v::uuid from ids where k = 'event_a'), 'ＭＡＣＨＩＮＥ learning')$$,
  '23505', null, 'full-width variant collides with the normalized tag');
insert into public.interest_tags (event_id, label) values ((select v::uuid from ids where k = 'event_a'), 'Secret');
update public.interest_tags set hidden = true where label = 'Secret';

insert into public.event_assets (event_id, kind, storage_path)
select id, 'banner', org_id || '/' || id || '/banner.png' from public.events where slug = 'conf-a';
select throws_ok(
  $$insert into public.event_assets (event_id, kind, storage_path)
    select id, 'share', 'elsewhere/share.png' from public.events where slug = 'conf-a'$$,
  '42501', null, 'asset path must be under {org_id}/{event_id}/');
select throws_ok(
  $$insert into public.event_assets (event_id, kind, storage_path)
    select id, 'logo', org_id || '/' || id || '/logo.png' from public.events where slug = 'conf-a'$$,
  '23514', null, 'only banner and share images are accepted');
select throws_ok(
  $$insert into public.event_assets (event_id, kind, storage_path)
    select id, 'banner', org_id || '/' || id || '/banner2.png' from public.events where slug = 'conf-a'$$,
  '23505', null, 'one banner per event');

insert into storage.objects (bucket_id, name, owner_id)
select 'event-assets', org_id || '/' || id || '/banner.png', auth.uid()::text from public.events where slug = 'conf-a';
select is((select count(*)::int from storage.objects where bucket_id = 'event-assets'), 1, 'A uploads own event asset');

insert into ids values ('invite_c', public.create_invite((select v::uuid from ids where k = 'org_a'), 'C@test.dev', 'staff'));
insert into ids values ('invite_x', public.create_invite((select v::uuid from ids where k = 'org_a'), 'x@test.dev', 'staff'));
select is((select count(*)::int from public.org_invites), 2, 'A sees own invites');
select throws_ok($$select token_hash from public.org_invites$$, '42501', null, 'token hash is not selectable');

-- ---------------------------------------------------------------- slug & validation rules
select throws_ok(
  $$insert into public.events (org_id, slug, name, starts_at, ends_at, timezone)
    values ((select v::uuid from ids where k = 'org_a'), 'app', 'X', now(), now() + interval '1 day', 'UTC')$$,
  '23514', null, 'reserved slug rejected');
select throws_ok(
  $$insert into public.events (org_id, slug, name, starts_at, ends_at, timezone)
    values ((select v::uuid from ids where k = 'org_a'), 'Bad_Slug', 'X', now(), now() + interval '1 day', 'UTC')$$,
  '23514', null, 'non-DNS-label slug rejected');
select throws_ok(
  $$insert into public.events (org_id, slug, name, starts_at, ends_at, timezone)
    values ((select v::uuid from ids where k = 'org_a'), 'tz-bad', 'X', now(), now() + interval '1 day', 'Mars/Olympus')$$,
  '22023', null, 'unknown timezone rejected');
select throws_ok(
  $$update public.events set retention_days = 6 where slug = 'conf-a'$$, '23514', null, 'retention 6 rejected');
select throws_ok(
  $$update public.events set retention_days = 91 where slug = 'conf-a'$$, '23514', null, 'retention 91 rejected');
select throws_ok(
  $$update public.events set status = 'published' where slug = 'conf-a'$$, '42501', null, 'status not directly writable');

update public.events set slug = 'conf-a2' where slug = 'conf-a';
select is((select slug from public.events where id = (select v::uuid from ids where k = 'event_a')), 'conf-a2', 'slug editable before publish');
update public.events set slug = 'conf-a' where slug = 'conf-a2';

-- ---------------------------------------------------------------- B cannot see or touch org A
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.dev');
insert into ids values ('org_b', public.create_organization('Org B', 'org-b'));

select is((select count(*)::int from public.organizations), 1, 'B sees only own org');
select is((select count(*)::int from public.org_members), 1, 'B sees only own org members');
select is((select count(*)::int from public.events where id = (select v::uuid from ids where k = 'event_a')), 0, 'B cannot see A''s draft event');
select is((select count(*)::int from public.interest_tags where event_id = (select v::uuid from ids where k = 'event_a')), 0, 'B cannot see A''s draft tags');
select is((select count(*)::int from public.event_assets where event_id = (select v::uuid from ids where k = 'event_a')), 0, 'B cannot see A''s draft assets');
select is((select count(*)::int from public.org_invites), 0, 'B cannot see A''s invites');
select is((select count(*)::int from public.accounts where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
          'B cannot see A''s account');
select is((select count(*)::int from public.accounts where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 1,
          'B still sees own account');
select throws_ok(
  $$insert into public.events (org_id, slug, name, starts_at, ends_at, timezone)
    values ((select v::uuid from ids where k = 'org_a'), 'hijack', 'X', now(), now() + interval '1 day', 'UTC')$$,
  '42501', null, 'B cannot create events in org A');
update public.events set name = 'pwned' where id = (select v::uuid from ids where k = 'event_a');
select throws_ok($$select public.publish_event((select v::uuid from ids where k = 'event_a'))$$,
                 '42501', null, 'B cannot publish A''s event');
select throws_ok($$select public.rotate_join_code((select v::uuid from ids where k = 'event_a'))$$,
                 '42501', null, 'B cannot rotate A''s join code');
select throws_ok($$select public.create_invite((select v::uuid from ids where k = 'org_a'), 'b2@test.dev', 'admin')$$,
                 '42501', null, 'B cannot invite into org A');
select throws_ok(
  $$insert into public.interest_tags (event_id, label) values ((select v::uuid from ids where k = 'event_a'), 'spam')$$,
  '42501', null, 'B cannot add tags to A''s event');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('event-assets', (select v from ids where k = 'org_a') || '/' || (select v from ids where k = 'event_a') || '/x.png', auth.uid()::text)$$,
  '42501', null, 'B cannot upload into A''s storage prefix');
select is((select count(*)::int from storage.objects where bucket_id = 'event-assets'), 0,
          'B cannot see A''s storage objects through RLS listing');

-- ---------------------------------------------------------------- invites
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003', 'c@test.dev');
select throws_ok($$select public.accept_invite((select v from ids where k = 'invite_x'))$$,
                 '42501', null, 'invite for another email is rejected');
select throws_ok($$select public.accept_invite('not-a-token')$$, 'P0002', null, 'unknown token rejected');
select is(public.accept_invite((select v from ids where k = 'invite_c')), (select v::uuid from ids where k = 'org_a'),
          'C accepts own invite');
select is((select role from public.org_members where user_id = auth.uid()), 'staff', 'C joined as staff');
select throws_ok($$select public.accept_invite((select v from ids where k = 'invite_c'))$$,
                 'P0002', null, 'invite cannot be reused');
select is((select count(*)::int from public.accounts
             where user_id in ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002')),
          1, 'C sees co-member A''s account but not outsider B''s');
select throws_ok($$select public.create_invite((select v::uuid from ids where k = 'org_a'), 'd@test.dev', 'staff')$$,
                 '42501', null, 'staff cannot invite');
select throws_ok($$select public.remove_org_member((select v::uuid from ids where k = 'org_a'), 'aaaaaaaa-0000-0000-0000-000000000001')$$,
                 '42501', null, 'staff cannot remove the owner');

-- ---------------------------------------------------------------- join code, publish, public read
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.dev');
update public.events set join_mode = 'code' where slug = 'conf-a';
select throws_ok($$select public.publish_event((select v::uuid from ids where k = 'event_a'))$$,
                 'P0001', null, 'code-mode event needs a code before publish');
insert into ids values ('code1', public.rotate_join_code((select v::uuid from ids where k = 'event_a')));
select matches((select v from ids where k = 'code1'), '^[A-Z2-7]{10}$', 'join code is 10 base32 chars');
insert into ids values ('code2', public.rotate_join_code((select v::uuid from ids where k = 'event_a')));
select public.publish_event((select v::uuid from ids where k = 'event_a'));
select throws_ok($$update public.events set slug = 'conf-renamed' where slug = 'conf-a'$$,
                 '23514', null, 'slug locked after publish');
select throws_ok($$select public.remove_org_member((select v::uuid from ids where k = 'org_a'), auth.uid())$$,
                 'P0001', null, 'last owner cannot leave');
reset role;

select ok(not private.check_join_code((select v::uuid from ids where k = 'event_a'), (select v from ids where k = 'code1')),
          'rotated (old) code no longer valid');
select ok(private.check_join_code((select v::uuid from ids where k = 'event_a'), lower((select v from ids where k = 'code2'))),
          'current code valid, case-insensitive');
select is((select name from public.events where slug = 'conf-a'), 'Conf A', 'B''s update did not apply');

set local role anon;
select is((select count(*)::int from public.events where slug = 'conf-a'), 1, 'anon sees the published event');
select is((select array_agg(label) from public.interest_tags where event_id = (select v::uuid from ids where k = 'event_a')), array['Machine Learning'], 'anon sees only visible tags');
select is((select count(*)::int from public.event_assets where event_id = (select v::uuid from ids where k = 'event_a')), 1, 'anon sees published event assets');
reset role;

-- Suspending org A hides everything.
update public.organizations set suspended_at = now() where slug = 'org-a';
set local role anon;
select is((select count(*)::int from public.events where id = (select v::uuid from ids where k = 'event_a')), 0, 'suspended org''s event hidden from anon');
reset role;
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.dev');
select is((select count(*)::int from public.organizations) + (select count(*)::int from public.events where id = (select v::uuid from ids where k = 'event_a')), 0,
          'suspended org''s members get 0 rows');
reset role;

select * from finish();
rollback;
