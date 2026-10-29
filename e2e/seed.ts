import { Pool } from "pg";

// Direct DB seeding for e2e speed (as postgres, bypassing RLS). The organizer UI has its own test.
const pool = new Pool({ connectionString: process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", max: 2 });

export async function userIdByEmail(email: string): Promise<string> {
  const { rows } = await pool.query("select id from auth.users where email = $1", [email]);
  return rows[0].id;
}

/** Creates an org owned by `ownerId` with one published event. Returns the slug (and code in code mode). */
export async function seedEvent(opts: { ownerId: string; tags: string[]; code?: string; name?: string }) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const slug = `ev-${id}`;
  const { rows: [org] } = await pool.query(
    "insert into public.organizations (name, slug) values ($1, $2) returning id", [`Org ${id}`, `org-${id}`]);
  await pool.query("insert into public.org_members (org_id, user_id, role) values ($1, $2, 'owner')", [org.id, opts.ownerId]);
  const { rows: [ev] } = await pool.query(
    `insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at, join_mode)
     values ($1, $2, $3, '2026-11-03 14:00+00', '2026-11-04 23:00+00', 'America/New_York', 'published', now(), $4)
     returning id`,
    [org.id, slug, opts.name ?? `Event ${id}`, opts.code ? "code" : "open"]);
  if (opts.code) {
    await pool.query("update public.event_secrets set join_code_hash = private.sha256_hex($2) where event_id = $1", [ev.id, opts.code]);
  }
  for (const label of opts.tags) {
    await pool.query("insert into public.interest_tags (event_id, label, is_official) values ($1, $2, true)", [ev.id, label]);
  }
  return { slug, eventId: ev.id as string };
}

/** Adds a completed, visible attendee holding the given (official) tag labels. */
export async function seedAttendee(eventId: string, opts: { name: string; headline?: string; tags: string[]; lookingFor?: string }) {
  const { rows: [u] } = await pool.query(
    `insert into auth.users (id, email, aud, role, raw_user_meta_data)
     values (gen_random_uuid(), gen_random_uuid() || '@seed.test', 'authenticated', 'authenticated', $1) returning id`,
    [JSON.stringify({ full_name: opts.name })]);
  if (opts.headline) await pool.query("update public.accounts set headline = $2 where user_id = $1", [u.id, opts.headline]);
  const { rows: [a] } = await pool.query(
    `insert into public.attendees (event_id, user_id, joined_via, completed_at, looking_for)
     values ($1, $2, 'link', now(), $3) returning id`, [eventId, u.id, opts.lookingFor ?? ""]);
  await pool.query(
    `insert into public.attendee_interests (attendee_id, tag_id, event_id)
     select $1, t.id, $2 from public.interest_tags t where t.event_id = $2 and t.label = any($3::text[])`,
    [a.id, eventId, opts.tags]);
}

/** Runs the stats rebuild now instead of waiting for the 30 s cron. */
export async function rebuildStats() {
  await pool.query("select private.rebuild_dirty_event_stats()");
}

/** Connects two attendees of an event (accepted request + conversation). Returns the conversation id. */
export async function seedConversation(eventId: string, userA: string, userB: string): Promise<string> {
  const { rows } = await pool.query(
    "select id, user_id from public.attendees where event_id = $1 and user_id = any($2::uuid[])", [eventId, [userA, userB]]);
  const a = rows.find((r) => r.user_id === userA).id;
  const b = rows.find((r) => r.user_id === userB).id;
  await pool.query(`insert into public.connection_requests (event_id, from_attendee, to_attendee, status, responded_at)
                    values ($1, $2, $3, 'accepted', now())`, [eventId, a, b]);
  const { rows: [c] } = await pool.query(
    `insert into public.conversations (event_id, attendee_lo, attendee_hi) values ($1, least($2::uuid, $3::uuid), greatest($2::uuid, $3::uuid))
     returning id`, [eventId, a, b]);
  await pool.query("insert into public.conversation_participants (conversation_id, attendee_id) values ($1, $2), ($1, $3)", [c.id, a, b]);
  return c.id;
}

export async function makePlatformAdmin(userId: string) {
  await pool.query("insert into public.platform_admins (user_id) values ($1) on conflict do nothing", [userId]);
}

export async function authUserCount(email: string): Promise<number> {
  const { rows } = await pool.query("select count(*)::int as n from auth.users where email = $1", [email]);
  return rows[0].n;
}
