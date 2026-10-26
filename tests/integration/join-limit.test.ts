import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { asUser, DB_URL } from "./db";

// Plan Phase 2 AC: with attendee_limit = 100, 150 concurrent joins yield exactly 100 attendees.
const pool = new Pool({ connectionString: DB_URL, max: 60 });
const run = randomUUID().slice(0, 8);
const slug = `limit-${run}`;
const users = Array.from({ length: 150 }, () => randomUUID());
let orgId: string;

beforeAll(async () => {
  // Seed as postgres (bypasses RLS): 150 users, an org capped at 100, one published open event.
  await pool.query(
    `insert into auth.users (id, email, aud, role)
     select u, 'limit-' || u || '@test.dev', 'authenticated', 'authenticated' from unnest($1::uuid[]) u`, [users]);
  orgId = (await pool.query(
    "insert into public.organizations (name, slug, attendee_limit) values ($1, $2, 100) returning id",
    [`Limit ${run}`, `limit-org-${run}`])).rows[0].id;
  await pool.query(
    `insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
     values ($1, $2, 'Limit test', now(), now() + interval '1 day', 'UTC', 'published', now())`, [orgId, slug]);
});

afterAll(async () => {
  await pool.query("delete from public.organizations where id = $1", [orgId]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [users]);
  await pool.query("delete from public.accounts where user_id = any($1::uuid[])", [users]);
  await pool.end();
});

it("150 concurrent joins against a limit of 100 admit exactly 100", async () => {
  const statuses = await Promise.all(users.map((u) =>
    asUser(pool, u, async (c) => (await c.query("select status from public.join_event($1)", [slug])).rows[0].status as string)));

  const counts = statuses.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});
  expect(counts).toEqual({ joined: 100, full: 50 });
  const { rows } = await pool.query(
    "select count(*)::int as n from public.attendees a join public.events e on e.id = a.event_id where e.slug = $1", [slug]);
  expect(rows[0].n).toBe(100);
});
