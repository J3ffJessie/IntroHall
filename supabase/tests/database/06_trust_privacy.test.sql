begin;
select plan(77);

-- ---------------------------------------------------------------- helpers (run as postgres)
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create temp table k (name text primary key, id uuid);
grant select, insert on k to authenticated, service_role;
grant select on k to anon;
create function pg_temp.k(p text) returns uuid language sql as $$ select id from k where name = p $$;
grant execute on function pg_temp.k(text) to authenticated, service_role, anon;

create function pg_temp.mk_user(p_key text, p_name text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (v, p_key || '6@test.dev', 'authenticated', 'authenticated', json_build_object('full_name', p_name));
  insert into k values (p_key, v);
  return v;
end $$;
create function pg_temp.mk_event(p_key text, p_ends interval, p_status text default 'published') returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
  values (pg_temp.k('org'), 'phase6-' || p_key, 'P6 ' || p_key, now() + p_ends - interval '1 day', now() + p_ends, 'UTC',
          p_status, case when p_status <> 'draft' then now() end)
  returning id into v;
  insert into k values (p_key, v);
  return v;
end $$;
create function pg_temp.mk_attendee(p_key text, p_event uuid, p_user uuid, p_joined timestamptz, p_completed boolean default true)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.attendees (event_id, user_id, joined_via, joined_at, completed_at)
  values (p_event, p_user, 'link', p_joined, case when p_completed then p_joined end)
  returning id into v;
  insert into k values (p_key, v);
  return v;
end $$;
create function pg_temp.tag(p_label text) returns uuid language sql as $$
  select id from public.interest_tags where event_id = (select id from k where name = 'e') and label = p_label;
$$;
grant execute on function pg_temp.tag(text) to authenticated;
-- Every uuid column in a public table that holds p_id, as 'table.column'.
create function pg_temp.refs(p_id uuid) returns text[] language plpgsql as $$
declare r record; n integer; v_out text[] := '{}';
begin
  for r in select c.table_name, c.column_name
             from information_schema.columns c
             join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
            where c.table_schema = 'public' and c.data_type = 'uuid' and t.table_type = 'BASE TABLE'
            order by 1, 2 loop
    execute format('select count(*) from public.%I where %I = $1', r.table_name, r.column_name) into n using p_id;
    if n > 0 then v_out := v_out || (r.table_name || '.' || r.column_name); end if;
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------- fixture
-- Org owner O, staff S; event E (UTC) with attendees A, B, C (completed) and D (incomplete).
select pg_temp.mk_user('o', 'Olga'), pg_temp.mk_user('s', 'Sam'), pg_temp.mk_user('ua', 'Ann'),
       pg_temp.mk_user('ub', 'Bob'), pg_temp.mk_user('uc', 'Cy'), pg_temp.mk_user('ud', 'Dee'),
       pg_temp.mk_user('padmin', 'Pat');
with org as (insert into public.organizations (name, slug) values ('Org6', 'org-phase6') returning id)
insert into k select 'org', id from org;
insert into public.org_members values (pg_temp.k('org'), pg_temp.k('o'), 'owner'), (pg_temp.k('org'), pg_temp.k('s'), 'staff'),
                                      (pg_temp.k('org'), pg_temp.k('ua'), 'staff');
select pg_temp.mk_event('e', interval '1 day');
insert into public.interest_tags (event_id, label, is_official, created_by) values
  (pg_temp.k('e'), 'Rust', true, null), (pg_temp.k('e'), 'Go', true, null), (pg_temp.k('e'), 'Python', true, null),
  (pg_temp.k('e'), 'Rusty', false, pg_temp.k('ua')), (pg_temp.k('e'), 'Slur', false, pg_temp.k('ub'));
select pg_temp.mk_attendee('a', pg_temp.k('e'), pg_temp.k('ua'), '2026-11-03 10:15+00'),
       pg_temp.mk_attendee('b', pg_temp.k('e'), pg_temp.k('ub'), '2026-11-03 10:40+00'),
       pg_temp.mk_attendee('c', pg_temp.k('e'), pg_temp.k('uc'), '2026-11-03 11:05+00'),
       pg_temp.mk_attendee('d', pg_temp.k('e'), pg_temp.k('ud'), '2026-11-03 11:30+00', false);
insert into public.attendee_interests (attendee_id, tag_id, event_id)
select pg_temp.k(x.att), pg_temp.tag(x.label), pg_temp.k('e')
  from (values ('a', 'Rust'), ('a', 'Go'), ('a', 'Slur'), ('b', 'Rust'), ('b', 'Rusty'), ('b', 'Slur'),
               ('c', 'Python'), ('c', 'Rusty')) x(att, label);
select private.rebuild_event_stats(array[pg_temp.k('e')]);

set local role authenticated;
select pg_temp.as_user(pg_temp.k('ua'));
select public.send_request(pg_temp.k('b'), 'Hi Bob');
select public.send_request(pg_temp.k('c'), 'Hi Cy');
select pg_temp.as_user(pg_temp.k('ub'));
insert into k select 'conv', public.respond_request(
  (select request_id from public.get_connections(pg_temp.k('e')) where direction = 'incoming'), true);
select pg_temp.as_user(pg_temp.k('uc'));
select public.respond_request((select request_id from public.get_connections(pg_temp.k('e')) where direction = 'incoming'), false);
select pg_temp.as_user(pg_temp.k('ua'));
select public.send_message(pg_temp.k('conv'), gen_random_uuid(), 'Hi B, from A');
select public.save_push_subscription(pg_temp.k('e'), 'https://push.example/a6', 'k', 'a', 'Firefox');
select public.block_attendee(pg_temp.k('d'));
insert into k select 'rep_by_a', public.report_attendee(pg_temp.k('c'), 'Spam');
select pg_temp.as_user(pg_temp.k('ub'));
select public.send_message(pg_temp.k('conv'), gen_random_uuid(), 'Hi A, from B');
insert into k select 'rep_of_a', public.report_attendee(pg_temp.k('a'), 'Rude',
  (select id from public.messages where body = 'Hi B, from A'));
reset role;
insert into public.announcements (event_id, author_user, title) values (pg_temp.k('e'), pg_temp.k('ua'), 'By Ann');
insert into public.join_attempts (user_id, event_id, success) values (pg_temp.k('ua'), pg_temp.k('e'), true);
update public.reports set resolved_by = pg_temp.k('ua') where id = pg_temp.k('rep_by_a');

-- ---------------------------------------------------------------- analytics (§4.7)
set local role authenticated;
select pg_temp.as_user(pg_temp.k('uc'));
select throws_ok($$select public.get_event_analytics(pg_temp.k('e'))$$, '42501', null, 'attendees cannot read analytics');
select pg_temp.as_user(pg_temp.k('s'));
create temp table an as select public.get_event_analytics(pg_temp.k('e')) as j;
reset role;
select is((select j - 'joins_by_hour' - 'top_tags' from an),
          '{"joined":4,"completed":3,"active":3,"left":0,"removed":0,"requests_sent":2,"requests_accepted":1,"conversations_started":1}'::jsonb,
          'staff see the fixture counts');
select is((select j -> 'joins_by_hour' from an),
          '[{"hour":"2026-11-03T10:00","joins":2},{"hour":"2026-11-03T11:00","joins":2}]'::jsonb, 'joins bucketed by local hour');
select is((select array_agg(t ->> 'label' || ':' || (t ->> 'attendees')) from an, jsonb_array_elements(j -> 'top_tags') t),
          array['Rust:2', 'Rusty:2', 'Slur:2', 'Go:1', 'Python:1'], 'top tags with holder counts');

-- ---------------------------------------------------------------- export
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ua'));
create temp table ex as select public.export_my_data() as j;
reset role;
select is((select j ->> 'email' from ex), 'ua6@test.dev', 'export: email');
select is((select j -> 'account' ->> 'full_name' from ex), 'Ann', 'export: account');
select is((select jsonb_array_length(j -> 'attendees') from ex), 1, 'export: attendee rows');
select is((select array_agg(x ->> 'label' order by x ->> 'label') from ex, jsonb_array_elements(j -> 'attendee_interests') x),
          array['Go', 'Rust', 'Slur'], 'export: interests');
select is((select array_agg((x ->> 'other_name') || ':' || (x ->> 'status') order by x ->> 'other_name')
             from ex, jsonb_array_elements(j -> 'connection_requests') x),
          array['Bob:accepted', 'Cy:pending'], 'export: requests, with the silent decline still shown as pending');
select is((select array_agg(x ->> 'body') from ex, jsonb_array_elements(j -> 'messages') x), array['Hi B, from A'],
          'export: only messages A sent');
select is((select j -> 'push_subscriptions' -> 0 ->> 'endpoint' from ex), 'https://push.example/a6', 'export: push subscriptions');
select ok((select j -> 'push_subscriptions' -> 0 ? 'p256dh' from ex) is false, 'export omits push encryption keys');
select is((select j -> 'blocks' -> 0 ->> 'blocked_attendee' from ex)::uuid, pg_temp.k('d'), 'export: own blocks');
select is((select array_agg(x ->> 'reason') from ex, jsonb_array_elements(j -> 'reports') x), array['Spam'],
          'export: reports A filed, not reports about A');
select is((select jsonb_array_length(j -> 'organizations') from ex), 1, 'export: org memberships');

-- ---------------------------------------------------------------- hidden tags leave matching
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ua'));
select is((select shared_tags from public.get_matches(pg_temp.k('e')) where attendee_id = pg_temp.k('b')),
          array['Rust', 'Slur'], 'before hiding, both shared tags show');
select pg_temp.as_user(pg_temp.k('o'));
update public.interest_tags set hidden = true where id = pg_temp.tag('Slur');
select pg_temp.as_user(pg_temp.k('ua'));
select is((select shared_tags from public.get_matches(pg_temp.k('e')) where attendee_id = pg_temp.k('b')),
          array['Rust'], 'a hidden tag is no longer shown or scored');

-- ---------------------------------------------------------------- merge tags
select pg_temp.as_user(pg_temp.k('uc'));
select throws_ok($$select public.merge_tags(pg_temp.tag('Rusty'), pg_temp.tag('Rust'))$$, '42501', null,
                 'attendees cannot merge');
select pg_temp.as_user(pg_temp.k('s'));
select throws_ok($$select public.merge_tags(pg_temp.tag('Rust'), pg_temp.tag('Rust'))$$, 'P0001', null, 'no self-merge');
select throws_ok($$select public.merge_tags(pg_temp.tag('Rusty'), pg_temp.tag('Slur'))$$, 'P0001', null,
                 'cannot merge into a hidden tag');
select lives_ok($$select public.merge_tags(pg_temp.tag('Rusty'), pg_temp.tag('Rust'))$$, 'staff merge Rusty into Rust');
select throws_ok($$select public.merge_tags(pg_temp.tag('Rusty'), pg_temp.tag('Go'))$$, 'P0001', null,
                 'a merged tag cannot be merged again');
reset role;
select is((select array_agg(a.name order by a.name) from public.attendee_interests ai join k a on a.id = ai.attendee_id
            where ai.tag_id = pg_temp.tag('Rust')), array['a', 'b', 'c'], 'holders moved, B counted once');
select is((select count(*)::int from public.attendee_interests where tag_id = pg_temp.tag('Rusty')), 0, 'old tag has no holders');
select is((select merged_into from public.interest_tags where id = pg_temp.tag('Rusty')), pg_temp.tag('Rust'), 'old tag is an alias');
select ok((select stats_dirty from public.events where id = pg_temp.k('e')), 'merge marks stats dirty');
set local role authenticated;
select pg_temp.as_user(pg_temp.k('uc'));
select public.upsert_interests(pg_temp.k('e'), array[pg_temp.tag('Python')], array['rusty']);
reset role;
select is((select array_agg(t.label order by t.label) from public.attendee_interests ai join public.interest_tags t on t.id = ai.tag_id
            where ai.attendee_id = pg_temp.k('c')), array['Python', 'Rust'], 'typing the old label later lands on the merged tag');

-- ---------------------------------------------------------------- platform admins
set local role authenticated;
select pg_temp.as_user(pg_temp.k('o'));
select is(public.am_platform_admin(), false, 'organizers are not platform admins');
select throws_ok($$select * from public.admin_list_orgs()$$, '42501', null, 'non-admins cannot list orgs');
select throws_ok($$select public.admin_set_org_suspended(pg_temp.k('org'), true)$$, '42501', null, 'non-admins cannot suspend');
reset role;
insert into public.platform_admins (user_id) values (pg_temp.k('padmin'));
set local role authenticated;
select pg_temp.as_user(pg_temp.k('padmin'));
select is(public.am_platform_admin(), true, 'platform admin recognized');
select is((select owners from public.admin_list_orgs('org-phase6')), array['o6@test.dev'], 'org search shows owners');
select lives_ok($$select public.admin_set_org_suspended(pg_temp.k('org'), true)$$, 'admin suspends the org');
reset role;
select ok((select org_suspended from public.events where id = pg_temp.k('e')), 'its events are marked suspended');
set local role anon;
select is((select count(*)::int from public.events where id = (select id from k where name = 'e')), 0, 'suspended org events are hidden');
reset role;
set local role authenticated;
select pg_temp.as_user(pg_temp.k('padmin'));
select public.admin_set_org_suspended(pg_temp.k('org'), false);
reset role;

insert into auth.sessions (id, user_id) values (gen_random_uuid(), pg_temp.k('ud'));
set local role authenticated;
select pg_temp.as_user(pg_temp.k('padmin'));
select is((select email from public.admin_find_users('ud6@')), 'ud6@test.dev', 'find users by email');
select throws_ok($$select public.admin_set_user_suspended(pg_temp.k('padmin'), true)$$, 'P0001', null, 'admins cannot suspend themselves');
select lives_ok($$select public.admin_set_user_suspended(pg_temp.k('ud'), true)$$, 'admin suspends a person');
reset role;
select is((select banned_until from auth.users where id = pg_temp.k('ud')), 'infinity'::timestamptz, 'sign-in banned');
select is((select count(*)::int from auth.sessions where user_id = pg_temp.k('ud')), 0, 'sessions revoked');
select isnt((select banned_at from public.attendees where id = pg_temp.k('d')), null, 'banned from their events');
set local role authenticated;
select pg_temp.as_user(pg_temp.k('padmin'));
select is((select suspended from public.admin_find_users('ud6@')), true, 'shown as suspended');
select public.admin_set_user_suspended(pg_temp.k('ud'), false);
reset role;
select is((select banned_until from auth.users where id = pg_temp.k('ud')), null, 'unsuspend restores sign-in');

-- ---------------------------------------------------------------- account deletion
set local role authenticated;
select pg_temp.as_user(pg_temp.k('o'));
select is((select array_agg(name) from public.account_deletion_blockers()), array['Org6'], 'sole owner sees the blocking org');
select pg_temp.as_user(pg_temp.k('ua'));
select is((select count(*)::int from public.account_deletion_blockers()), 0, 'staff member has no blockers');
select throws_ok($$select public.delete_account_data(pg_temp.k('ua'))$$, '42501', null, 'users cannot call the deletion step directly');
reset role;
set local role service_role;
select throws_ok($$select public.delete_account_data(pg_temp.k('o'))$$, 'P0001', null, 'a sole owner cannot be deleted');
select lives_ok($$select public.delete_account_data(pg_temp.k('ua'))$$, 'delete-account step 1');
reset role;
select lives_ok($$delete from auth.users where id = pg_temp.k('ua')$$, 'auth user deleted without FK errors');

select is(pg_temp.refs(pg_temp.k('ua')), array['accounts.user_id'], 'only the anonymized account row still holds the user id');
select is(pg_temp.refs(pg_temp.k('a')), '{}'::text[], 'nothing references the deleted attendee row');
select is((select count(*)::int from public.reports where sender_snapshot ->> 'attendee_id' = pg_temp.k('a')::text), 1,
          'the report snapshot keeps the evidence');
select is((select full_name || '|' || headline || '|' || (deleted_at is not null) from public.accounts where user_id = pg_temp.k('ua')),
          'Deleted user||true', 'account anonymized');
select is((select read_only_reason from public.conversations where id = pg_temp.k('conv')), 'account_deleted',
          'their conversations are read-only');
select is((select count(*)::int from public.messages where conversation_id = pg_temp.k('conv')), 2,
          'messages stay for the other participant until retention');
set local role authenticated;
select pg_temp.as_user(pg_temp.k('ub'));
select is((select full_name from public.get_conversations(pg_temp.k('e'))), 'Deleted user', 'the partner sees "Deleted user"');
reset role;

-- ---------------------------------------------------------------- retention (default 30 days)
create function pg_temp.mk_convo(p_event uuid, p_tag text) returns uuid language plpgsql as $$
declare v_x uuid; v_y uuid; v_lo uuid; v_hi uuid; v_c uuid;
begin
  v_x := pg_temp.mk_attendee(p_tag || 'x', p_event, pg_temp.mk_user(p_tag || 'ux', 'X'), now() - interval '40 days');
  v_y := pg_temp.mk_attendee(p_tag || 'y', p_event, pg_temp.mk_user(p_tag || 'uy', 'Y'), now() - interval '40 days');
  v_lo := least(v_x, v_y); v_hi := greatest(v_x, v_y);
  insert into public.conversations (event_id, attendee_lo, attendee_hi) values (p_event, v_lo, v_hi) returning id into v_c;
  insert into public.messages (conversation_id, sender_attendee, client_msg_id, body)
  values (v_c, v_x, gen_random_uuid(), p_tag || ' plain'), (v_c, v_y, gen_random_uuid(), p_tag || ' reported');
  return v_c;
end $$;
select pg_temp.mk_event('ended29', - interval '29 days'), pg_temp.mk_event('ended31', - interval '31 days');
select pg_temp.mk_convo(pg_temp.k('ended29'), 'r29'), pg_temp.mk_convo(pg_temp.k('ended31'), 'r31');
insert into public.reports (event_id, reporter, target_attendee, message_id, reason)
select pg_temp.k('ended31'), pg_temp.k('r31x'), pg_temp.k('r31y'), id, 'Abuse' from public.messages where body = 'r31 reported';
select private.purge_expired_messages();
select is((select array_agg(body order by body) from public.messages where body like 'r__ %'),
          array['r29 plain', 'r29 reported', 'r31 reported'],
          'ended 29 days ago: kept; 31 days ago: deleted unless under an open report');

-- ---------------------------------------------------------------- auto-archive (14 days)
select pg_temp.mk_event('ended15', - interval '15 days'), pg_temp.mk_event('ended13', - interval '13 days'),
       pg_temp.mk_event('draft20', - interval '20 days', 'draft');
select cmp_ok(private.auto_archive_events(), '>=', 1, 'auto-archive runs');
select is((select array_agg(name || '=' || (select status from public.events where id = k.id) order by name) from k
            where name in ('ended15', 'ended13', 'draft20')),
          array['draft20=draft', 'ended13=published', 'ended15=archived'], 'archived 14 days after ends_at (published only)');

-- ---------------------------------------------------------------- event delete, restore, purge
set local role authenticated;
select pg_temp.as_user(pg_temp.k('s'));
select throws_ok($$select public.delete_event(pg_temp.k('ended13'))$$, '42501', null, 'staff cannot delete events');
select pg_temp.as_user(pg_temp.k('o'));
select lives_ok($$select public.delete_event(pg_temp.k('ended13'))$$, 'owner deletes an event');
select is((select count(*)::int from public.events where id = pg_temp.k('ended13')), 0, 'deleted event disappears for the org');
select is((select array_agg(name) from public.get_deleted_events(pg_temp.k('org'))), array['P6 ended13'], 'listed as recently deleted');
select lives_ok($$select public.restore_event(pg_temp.k('ended13'))$$, 'restore within 30 days');
select is((select count(*)::int from public.events where id = pg_temp.k('ended13')), 1, 'restored event is back');
select public.delete_event(pg_temp.k('ended13'));
reset role;
set local role anon;
select is((select count(*)::int from public.events where id = (select id from k where name = 'ended13')), 0, 'deleted event is not public');
reset role;
update public.events set deleted_at = now() - interval '31 days' where id = pg_temp.k('ended13');
set local role authenticated;
select pg_temp.as_user(pg_temp.k('o'));
select throws_ok($$select public.restore_event(pg_temp.k('ended13'))$$, '42501', null, 'not restorable after 30 days');
select throws_ok($$select public.purge_event(pg_temp.k('ended13'))$$, '42501', null, 'users cannot purge');
reset role;
set local role service_role;
select is((select array_agg(event_id) from public.purge_targets()), array[pg_temp.k('ended13')], 'purge targets: past the window only');
select public.purge_event(pg_temp.k('ended13'));
reset role;
select is((select count(*)::int from public.events where id = pg_temp.k('ended13')), 0, 'event hard-deleted');

-- ---------------------------------------------------------------- organization delete
set local role authenticated;
select pg_temp.as_user(pg_temp.k('s'));
select throws_ok($$select public.delete_organization(pg_temp.k('org'))$$, '42501', null, 'staff cannot delete the org');
select pg_temp.as_user(pg_temp.k('o'));
select lives_ok($$select public.delete_organization(pg_temp.k('org'))$$, 'owner deletes the org');
select is((select count(*)::int from public.organizations where id = pg_temp.k('org')), 0, 'org gone from the dashboard');
select is((select count(*)::int from public.account_deletion_blockers()), 0, 'a deleted org no longer blocks account deletion');
reset role;
select is((select count(*)::int from public.events where org_id = pg_temp.k('org') and deleted_at is null), 0, 'all its events deleted');
set local role service_role;
select is(public.purge_deleted_orgs(), 0, 'not purged inside the 30-day window');
reset role;
update public.organizations set deleted_at = now() - interval '31 days' where id = pg_temp.k('org');
delete from public.events where org_id = pg_temp.k('org');
set local role service_role;
select is(public.purge_deleted_orgs(), 1, 'purged once its events are gone');
reset role;

select * from finish();
rollback;
