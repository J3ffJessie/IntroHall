// Seeds the Phase 4 realtime fixture: one event, PAIRS × 2 completed attendees, one conversation per pair.
// Writes load/.realtime-fixture.json for load/realtime.js.
// Usage: node load/seed-realtime.mts [pairs=100]   (re-running replaces the previous fixture)
import { writeFileSync } from "node:fs";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const PAIRS = Number(process.argv[2] ?? 100);
const SLUG = "load-realtime";

const c = await pool.connect();
try {
  await c.query("begin");
  await c.query(`delete from auth.users where email like '%@load-realtime.test'`);
  await c.query(`delete from public.accounts a where not exists (select 1 from auth.users u where u.id = a.user_id)
                   and a.user_id in (select user_id from public.attendees where event_id in (select id from public.events where slug = $1))`, [SLUG]);
  await c.query("delete from public.organizations where slug = $1", [SLUG]);
  const { rows: [org] } = await c.query("insert into public.organizations (name, slug) values ('Realtime load', $1) returning id", [SLUG]);
  const { rows: [ev] } = await c.query(
    `insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
     values ($1, $2, 'Realtime load test', now(), now() + interval '1 day', 'UTC', 'published', now()) returning id`, [org.id, SLUG]);
  await c.query(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
                 select gen_random_uuid(), 'r' || i || '@load-realtime.test', 'authenticated', 'authenticated',
                        json_build_object('full_name', 'RT ' || i) from generate_series(1, $1) i`, [PAIRS * 2]);
  await c.query(`insert into public.attendees (event_id, user_id, joined_via, completed_at)
                 select $1, u.id, 'link', now() from auth.users u where u.email like '%@load-realtime.test'`, [ev.id]);
  // Pair attendees 1–2, 3–4, …; one conversation each.
  const { rows: pairs } = await c.query(
    `with numbered as (select a.id, a.user_id, row_number() over (order by a.id) n
                         from public.attendees a where a.event_id = $1),
          p as (select x.id a_att, x.user_id a_user, y.id b_att, y.user_id b_user
                  from numbered x join numbered y on y.n = x.n + 1 where x.n % 2 = 1),
          conv as (insert into public.conversations (event_id, attendee_lo, attendee_hi)
                   select $1, least(a_att, b_att), greatest(a_att, b_att) from p returning id, attendee_lo, attendee_hi)
     select conv.id conversation_id, p.* from conv join p on least(p.a_att, p.b_att) = conv.attendee_lo`, [ev.id]);
  await c.query(`insert into public.conversation_participants (conversation_id, attendee_id)
                 select x.conversation_id, unnest(array[x.a_att, x.b_att])
                   from jsonb_to_recordset($1::jsonb) as x(conversation_id uuid, a_att uuid, b_att uuid)`, [JSON.stringify(pairs)]);
  await c.query("commit");
  writeFileSync(new URL("./.realtime-fixture.json", import.meta.url), JSON.stringify({ eventId: ev.id, pairs }));
  console.log(`Seeded ${PAIRS} conversations (${PAIRS * 2} attendees) → load/.realtime-fixture.json`);
} catch (e) {
  await c.query("rollback");
  throw e;
} finally {
  c.release();
  await pool.end();
}
