begin;
select plan(24);

-- Helpers (run as postgres): an org/event, and completed attendees with given tags.
create function pg_temp.mk_event(p_slug text) returns uuid language plpgsql as $$
declare v_org uuid; v_event uuid;
begin
  insert into public.organizations (name, slug) values (p_slug, 'org-' || p_slug) returning id into v_org;
  insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
  values (v_org, p_slug, p_slug, now(), now() + interval '1 day', 'UTC', 'published', now()) returning id into v_event;
  return v_event;
end $$;

create function pg_temp.mk_tag(p_event uuid, p_label text) returns uuid language sql as $$
  insert into public.interest_tags (event_id, label, is_official) values (p_event, p_label, true) returning id;
$$;

-- Returns the new user's id. Completed + visible attendee holding p_tags.
create function pg_temp.mk_attendee(p_event uuid, p_name text, p_tags uuid[], p_completed timestamptz default now())
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid(); v_att uuid;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (v_user, v_user || '@m.test', 'authenticated', 'authenticated', json_build_object('full_name', p_name));
  insert into public.attendees (event_id, user_id, joined_via, completed_at)
  values (p_event, v_user, 'link', p_completed) returning id into v_att;
  insert into public.attendee_interests (attendee_id, tag_id, event_id) select v_att, t, p_event from unnest(p_tags) t;
  return v_user;
end $$;

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create temp table k (name text primary key, id uuid);
grant select on k to authenticated;

-- ---------------------------------------------------------------- AC: rarity ranking (100 attendees)
insert into k values ('e', pg_temp.mk_event('match-rarity'));
insert into k values ('rare', pg_temp.mk_tag((select id from k where name = 'e'), 'Rare'));
insert into k values ('common', pg_temp.mk_tag((select id from k where name = 'e'), 'Common'));
insert into k values ('other', pg_temp.mk_tag((select id from k where name = 'e'), 'Other'));
-- Me holds Rare + Common. X shares only Rare (held by 2/100). Y shares only Common (held by 50/100).
insert into k values ('me', pg_temp.mk_attendee((select id from k where name = 'e'), 'Me',
  array[(select id from k where name = 'rare'), (select id from k where name = 'common')], now() - interval '1 hour'));
insert into k values ('x', pg_temp.mk_attendee((select id from k where name = 'e'), 'X Rare',
  array[(select id from k where name = 'rare')], now() - interval '2 hours'));
insert into k values ('y', pg_temp.mk_attendee((select id from k where name = 'e'), 'Y Common',
  array[(select id from k where name = 'common')], now()));
select pg_temp.mk_attendee((select id from k where name = 'e'), 'Common ' || i,
  array[(select id from k where name = 'common')], now() - interval '3 hours') from generate_series(1, 48) i;
insert into k values ('loner', pg_temp.mk_attendee((select id from k where name = 'e'), 'Loner',
  array[(select id from k where name = 'other')], now() - interval '5 minutes'));
select pg_temp.mk_attendee((select id from k where name = 'e'), 'Filler ' || i,
  array[(select id from k where name = 'other')], now() - interval '1 day') from generate_series(1, 48) i;

select is((select count(*)::int from public.attendees where event_id = (select id from k where name = 'e')), 100, '100 attendees');
select cmp_ok(private.rebuild_dirty_event_stats(), '>=', 1, 'cron rebuild claims dirty events');
select is((select n from public.event_stats where event_id = (select id from k where name = 'e')), 100, 'N = 100');
select is((select count from public.event_tag_stats where tag_id = (select id from k where name = 'rare')), 2, 'Rare held by 2');
select is((select count from public.event_tag_stats where tag_id = (select id from k where name = 'common')), 50, 'Common held by 50');
select is((select stats_dirty from public.events where id = (select id from k where name = 'e')), false, 'flag cleared');

set local role authenticated;
select pg_temp.as_user((select id from k where name = 'me'));
select is((select full_name from public.get_matches((select id from k where name = 'e')) limit 1), 'X Rare',
          'pair sharing a 2/100 tag ranks above pairs sharing a 50/100 tag');
select is((select round(score::numeric, 6) from public.get_matches((select id from k where name = 'e')) limit 1),
          round(ln(1 + 100.0 / 2), 6), 'score = ln(1 + N / count)');
select is((select full_name from public.get_matches((select id from k where name = 'e')) offset 1 limit 1), 'Y Common',
          'equal scores tie-break on most recent completed_at');
select is((select count(*)::int from public.get_matches((select id from k where name = 'e'))), 50,
          'matches = everyone sharing at least one tag (49 Common + X)');
select is((select shared_tags from public.get_matches((select id from k where name = 'e')) limit 1), array['Rare'],
          'shared tag labels returned for chips');
select is((select full_name from public.get_matches((select id from k where name = 'e'), 'everyone') limit 1), 'Loner',
          'Everyone tab: no shared tags, newest first');
select is((select count(*)::int from public.get_matches((select id from k where name = 'e'), 'everyone', null, 100)), 49,
          'Everyone tab has the 49 with zero shared tags');
select is((select array_agg(full_name) from public.get_matches((select id from k where name = 'e'), 'matches',
                                                                (select id from k where name = 'rare'))),
          array['X Rare'], 'tag filter narrows matches');

-- ---------------------------------------------------------------- AC: live filters beat stale stats
reset role;
update public.attendees set visibility = 'hidden' where user_id = (select id from k where name = 'x');
update public.attendees set left_at = now() where user_id = (select id from k where name = 'y');
update public.attendees set banned_at = now(), left_at = now()
 where user_id = (select user_id from public.attendees a join public.accounts ac using (user_id)
                   where a.event_id = (select id from k where name = 'e') and ac.full_name = 'Common 1');
set local role authenticated;
select pg_temp.as_user((select id from k where name = 'me'));
select is((select count(*)::int from public.get_matches((select id from k where name = 'e'), 'matches', null, 100)
            where full_name in ('X Rare', 'Y Common', 'Common 1')), 0,
          'hidden, left and banned attendees vanish before the stats rebuild');

-- ---------------------------------------------------------------- AC: rebuild after a visibility change
reset role;
select is((select stats_dirty from public.events where id = (select id from k where name = 'e')), true,
          'visibility change marks stats dirty');
select private.rebuild_dirty_event_stats();
select is((select n from public.event_stats where event_id = (select id from k where name = 'e')), 97, 'N rebuilt to 97');

-- ---------------------------------------------------------------- AC: N = 10, tag held by 9
insert into k values ('e10', pg_temp.mk_event('match-ten'));
insert into k values ('t9', pg_temp.mk_tag((select id from k where name = 'e10'), 'Popular'));
insert into k values ('me10', pg_temp.mk_attendee((select id from k where name = 'e10'), 'Me10', array[(select id from k where name = 't9')]));
select pg_temp.mk_attendee((select id from k where name = 'e10'), 'P' || i, array[(select id from k where name = 't9')]) from generate_series(1, 8) i;
select pg_temp.mk_attendee((select id from k where name = 'e10'), 'Q', '{}');
select private.rebuild_dirty_event_stats();
set local role authenticated;
select pg_temp.as_user((select id from k where name = 'me10'));
select ok((select min(score) from public.get_matches((select id from k where name = 'e10'))) > 0,
          'with N = 10, a tag held by 9 still contributes > 0');

-- ---------------------------------------------------------------- AC: brand-new tag with no stats row
reset role;
insert into k values ('fresh', pg_temp.mk_tag((select id from k where name = 'e10'), 'Brand New'));
insert into public.attendee_interests (attendee_id, tag_id, event_id)
select a.id, (select id from k where name = 'fresh'), a.event_id from public.attendees a
 where a.user_id = (select id from k where name = 'me10');
insert into k values ('w', pg_temp.mk_attendee((select id from k where name = 'e10'), 'W', array[(select id from k where name = 'fresh')]));
set local role authenticated;
select pg_temp.as_user((select id from k where name = 'me10'));
select is((select round(score::numeric, 6) from public.get_matches((select id from k where name = 'e10')) where full_name = 'W'),
          round(ln(1 + 10.0 / 1), 6), 'a tag with no stats row scores with count 1, without error');

-- ---------------------------------------------------------------- access
select throws_ok($$select * from public.event_tag_stats$$, '42501', null, 'stats tables are not readable directly');
select pg_temp.as_user((select id from k where name = 'me'));
select throws_ok($$select * from public.get_matches((select id from k where name = 'e10'))$$, '42501', null,
                 'non-attendee cannot get matches');
reset role;
update public.attendees set completed_at = null where user_id = (select id from k where name = 'me');
set local role authenticated;
select pg_temp.as_user((select id from k where name = 'me'));
select throws_ok($$select * from public.get_matches((select id from k where name = 'e'))$$, '42501', null,
                 'incomplete profile cannot get matches');
reset role;
update public.attendees set completed_at = now() where user_id = (select id from k where name = 'me');
set local role authenticated;
select pg_temp.as_user((select id from k where name = 'me'));
select is((select array_agg(label order by label) from public.get_event_tag_counts((select id from k where name = 'e'))
            where mine), array['Common', 'Rare'], 'tag counts mark my interests');

reset role;
select is((select count(*)::int from cron.job where jobname = 'rebuild-event-stats' and schedule = '30 seconds'), 1,
          'stats rebuild scheduled every 30 s');

select * from finish();
rollback;
