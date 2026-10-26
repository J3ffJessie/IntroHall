import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, expect, it } from "vitest";
import { DB_URL } from "./db";

// Plan Phase 3 AC: after a visibility change, stats are rebuilt within 60 s (by the real pg_cron job).
const pool = new Pool({ connectionString: DB_URL, max: 2 });
const run = randomUUID().slice(0, 8);
let orgId: string | undefined;
const users: string[] = [];

afterAll(async () => {
  if (orgId) await pool.query("delete from public.organizations where id = $1", [orgId]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [users]);
  await pool.query("delete from public.accounts where user_id = any($1::uuid[])", [users]);
  await pool.end();
});

it("pg_cron rebuilds stats within 60 s of a visibility change", async () => {
  orgId = (await pool.query("insert into public.organizations (name, slug) values ($1, $1) returning id", [`cron-${run}`])).rows[0].id;
  const eventId = (await pool.query(
    `insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
     values ($1, $2, 'Cron', now(), now() + interval '1 day', 'UTC', 'published', now()) returning id`,
    [orgId, `cron-${run}`])).rows[0].id;
  for (let i = 0; i < 3; i++) {
    const u = randomUUID();
    users.push(u);
    await pool.query("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [u, `${u}@cron.test`]);
    await pool.query("insert into public.attendees (event_id, user_id, joined_via, completed_at) values ($1, $2, 'link', now())", [eventId, u]);
  }
  await pool.query("select private.rebuild_event_stats(array[$1::uuid])", [eventId]);
  await pool.query("update public.events set stats_dirty = false where id = $1", [eventId]);
  const n = async () => (await pool.query("select n from public.event_stats where event_id = $1", [eventId])).rows[0]?.n;
  expect(await n()).toBe(3);

  await pool.query("update public.attendees set visibility = 'hidden' where user_id = $1", [users[0]]);
  const start = Date.now();
  while ((await n()) !== 2 && Date.now() - start < 60_000) await new Promise((r) => setTimeout(r, 1000));
  expect(await n()).toBe(2);
  console.log(`stats rebuilt ${Math.round((Date.now() - start) / 1000)} s after the change`);
}, 75_000);
