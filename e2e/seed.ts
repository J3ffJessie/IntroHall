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
