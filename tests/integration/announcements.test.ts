import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { DB_URL } from "./db";

// Plan Phase 5 ACs: concurrent claims → one job per announcement; scheduled post publishes within 90 s.
const pool = new Pool({ connectionString: DB_URL, max: 12 });
const run = randomUUID().slice(0, 8);
let orgId: string;
let eventId: string;
let userId: string;

beforeAll(async () => {
  orgId = (await pool.query("insert into public.organizations (name, slug) values ($1, $1) returning id", [`ann-${run}`])).rows[0].id;
  eventId = (await pool.query(
    `insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
     values ($1, $2, 'Ann', now(), now() + interval '1 day', 'America/New_York', 'published', now()) returning id`,
    [orgId, `ann-${run}`])).rows[0].id;
  // One subscribed attendee so announcements actually enqueue push jobs.
  userId = randomUUID();
  await pool.query("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [userId, `${userId}@ann.test`]);
  await pool.query("insert into public.attendees (event_id, user_id, joined_via, completed_at) values ($1, $2, 'link', now())", [eventId, userId]);
  const sub = (await pool.query(
    "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a') returning id",
    [userId, `https://push.example/${run}`])).rows[0].id;
  await pool.query("insert into public.push_subscription_events (subscription_id, event_id) values ($1, $2)", [sub, eventId]);
});

afterAll(async () => {
  await pool.query(`delete from pgmq.q_push_jobs where message ->> 'event_id' = $1`, [eventId]);
  await pool.query("delete from public.organizations where id = $1", [orgId]);
  await pool.query("delete from auth.users where id = $1", [userId]);
  await pool.query("delete from public.accounts where user_id = $1", [userId]);
  await pool.end();
});

const jobsFor = async (announcementIds: string[]) => (await pool.query(
  `select count(*)::int n from pgmq.q_push_jobs
    where message ->> 'event_id' = $1 and substring(message ->> 'tag' from 14)::uuid = any($2::uuid[])`,
  [eventId, announcementIds])).rows[0].n as number;

it("ten concurrent claim runs enqueue exactly one job per announcement", async () => {
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    ids.push((await pool.query(
      `insert into public.announcements (event_id, title, publish_at) values ($1, $2, now() - interval '1 second') returning id`,
      [eventId, `Due ${i}`])).rows[0].id);
  }
  await Promise.all(Array.from({ length: 10 }, () => pool.query("select private.claim_announcements()")));
  expect(await jobsFor(ids)).toBe(5);
  const { rows } = await pool.query("select count(*)::int n from public.announcements where id = any($1::uuid[]) and published_at is not null", [ids]);
  expect(rows[0].n).toBe(5);
});

it("pg_cron publishes a scheduled announcement within 90 s of publish_at", async () => {
  const { rows: [a] } = await pool.query(
    `insert into public.announcements (event_id, title, publish_at) values ($1, 'Lunch is served', now() + interval '5 seconds')
     returning id, publish_at`, [eventId]);
  let published: Date | null = null;
  const deadline = Date.now() + 100_000;
  while (!published && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2_000));
    published = (await pool.query("select published_at from public.announcements where id = $1", [a.id])).rows[0].published_at;
  }
  expect(published).not.toBeNull();
  const lagSeconds = (published!.getTime() - new Date(a.publish_at).getTime()) / 1000;
  console.log(`scheduled announcement published ${lagSeconds.toFixed(1)} s after publish_at`);
  expect(lagSeconds).toBeLessThanOrEqual(90);
  expect(await jobsFor([a.id])).toBe(1);
}, 120_000);
