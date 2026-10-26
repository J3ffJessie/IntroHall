// Seeds the Phase 3 load fixture: one published event, 20 interests with long-tail popularity,
// 5,000 completed attendees. Writes load/.matches-fixture.json for load/matches.js.
// Usage: node load/seed-matches.mts   (re-running replaces the previous fixture)
import { writeFileSync } from "node:fs";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const ATTENDEES = 5000;
const TAGS = 20;
const SLUG = "load-matches";

const c = await pool.connect();
try {
  await c.query("begin");
  // Replace a previous fixture (attendees, tags, stats cascade from the org/event).
  await c.query(`delete from auth.users where email like '%@load-matches.test'`);
  await c.query(`delete from public.accounts a where not exists (select 1 from auth.users u where u.id = a.user_id)
                   and a.user_id in (select user_id from public.attendees where event_id in
                     (select id from public.events where slug = $1))`, [SLUG]);
  await c.query("delete from public.organizations where slug = $1", [SLUG]);

  const { rows: [org] } = await c.query("insert into public.organizations (name, slug) values ('Load test', $1) returning id", [SLUG]);
  const { rows: [ev] } = await c.query(
    `insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
     values ($1, $2, 'Matching load test', now(), now() + interval '1 day', 'UTC', 'published', now()) returning id`,
    [org.id, SLUG]);
  await c.query(`insert into public.interest_tags (event_id, label, is_official)
                 select $1, 'Topic ' || lpad(i::text, 2, '0'), true from generate_series(1, $2) i`, [ev.id, TAGS]);

  await c.query(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
                 select gen_random_uuid(), 'u' || i || '@load-matches.test', 'authenticated', 'authenticated',
                        json_build_object('full_name', 'Load User ' || i)
                   from generate_series(1, $1) i`, [ATTENDEES]);
  await c.query(`insert into public.attendees (event_id, user_id, joined_via, completed_at, bio, looking_for)
                 select $1, u.id, 'link', now() - random() * interval '1 day', 'Bio text for load testing.', 'People to meet'
                   from auth.users u where u.email like '%@load-matches.test'`, [ev.id]);
  // Topic k is held with probability ~1.5/k (Zipf-like): ~5 interests each, a few very popular topics.
  await c.query(`insert into public.attendee_interests (attendee_id, tag_id, event_id)
                 select a.id, t.id, $1
                   from public.attendees a
                   join lateral (select id, row_number() over (order by label) k from public.interest_tags where event_id = $1) t on true
                  where a.event_id = $1 and random() < least(0.9, 1.5 / t.k)`, [ev.id]);
  await c.query(`insert into public.attendee_interests (attendee_id, tag_id, event_id)
                 select a.id, (select id from public.interest_tags where event_id = $1 order by random() limit 1), $1
                   from public.attendees a
                  where a.event_id = $1 and not exists (select 1 from public.attendee_interests ai where ai.attendee_id = a.id)`,
    [ev.id]);
  await c.query("select private.rebuild_event_stats(array[$1::uuid])", [ev.id]);
  await c.query("update public.events set stats_dirty = false where id = $1", [ev.id]);
  await c.query("commit");

  const { rows: users } = await c.query(
    "select user_id from public.attendees where event_id = $1 order by random() limit 500", [ev.id]);
  const { rows: tags } = await c.query("select id from public.interest_tags where event_id = $1", [ev.id]);
  const { rows: [stats] } = await c.query(
    `select count(*)::int as interests, round(avg(n), 1) as avg_per_attendee
       from (select count(*) n from public.attendee_interests where event_id = $1 group by attendee_id) x`, [ev.id]);
  writeFileSync(new URL("./.matches-fixture.json", import.meta.url),
    JSON.stringify({ eventId: ev.id, users: users.map((u) => u.user_id), tags: tags.map((t) => t.id) }));
  console.log(`Seeded ${ATTENDEES} attendees × ${TAGS} tags (${stats.avg_per_attendee} interests each on average) → load/.matches-fixture.json`);
} catch (e) {
  await c.query("rollback");
  throw e;
} finally {
  c.release();
  await pool.end();
}
