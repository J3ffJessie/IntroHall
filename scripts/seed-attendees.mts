// Fills an event with realistic demo attendees for trying out matching locally.
//
//   pnpm seed:attendees <event-slug> [count=25] [--reset]
//
// Users are created through the Auth admin API, so you can sign in as any of them with the
// normal email-code flow (codes arrive in Mailpit). Local development only.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const API = "http://127.0.0.1:54321";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// Local Supabase's well-known development JWT secret; refuses to run against anything else.
const JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const reset = process.argv.includes("--reset");
const slug = args[0];
const count = Number(args[1] ?? 25);
if (!slug || !Number.isInteger(count) || count < 1 || count > 500) {
  console.error("Usage: pnpm seed:attendees <event-slug> [count 1–500] [--reset]");
  process.exit(1);
}
const envUrl = readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
if (envUrl && !/127\.0\.0\.1|localhost/.test(envUrl)) {
  console.error(`Refusing to seed: .env.local points at ${envUrl}, not local Supabase.`);
  process.exit(1);
}

const FIRST = ["Ada", "Grace", "Linus", "Margaret", "Alan", "Katherine", "Tim", "Radia", "Ken", "Barbara", "Dennis",
  "Frances", "Guido", "Hedy", "James", "Karen", "Leslie", "Mary", "Niklaus", "Ole", "Priya", "Quinn", "Rosa", "Sofia",
  "Tariq", "Uma", "Victor", "Wen", "Ximena", "Yusuf", "Zara", "Mateo", "Aisha", "Kenji", "Lena", "Omar", "Ines", "Noah"];
const LAST = ["Lovelace", "Hopper", "Torvalds", "Hamilton", "Turing", "Johnson", "Berners-Lee", "Perlman", "Thompson",
  "Liskov", "Ritchie", "Allen", "van Rossum", "Lamarr", "Gosling", "Spärck Jones", "Lamport", "Shaw", "Wirth", "Dahl",
  "Patel", "Nguyen", "García", "Okafor", "Kim", "Silva", "Müller", "Haddad", "Ivanova", "Tanaka"];
const ROLES = ["Staff Engineer", "Product Manager", "Founder", "Data Scientist", "Designer", "Engineering Manager",
  "Developer Advocate", "Security Researcher", "ML Engineer", "CTO", "Student", "Investor", "Researcher"];
const COMPANIES = ["Acme Cloud", "Northwind", "Globex", "Initech", "Umbrella Labs", "Hooli", "Stark Industries",
  "Wayne Tech", "Soylent AI", "Pied Piper", "Vandelay Data", "", ""];
const LOOKING = ["co-founders", "people hiring", "feedback on my side project", "open-source collaborators",
  "mentors", "investors", "fellow first-timers", "folks to grab coffee with", "speaking tips", "beta testers"];
const BIOS = ["Building tools developers actually enjoy.", "Ten years in fintech, now exploring climate tech.",
  "Recovering consultant, current tinkerer.", "I run a small meetup and love connecting people.",
  "Shipping fast and occasionally breaking things.", "Previously at a big company, now at a tiny one.",
  "Ask me about my homelab.", "First conference — say hi!", ""];
const DEFAULT_TAGS = ["AI", "Rust", "Design Systems", "Product", "Climate Tech", "Security", "Data", "DevOps",
  "Open Source", "Startups"];

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function serviceRoleKey(): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ role: "service_role", iss: "supabase-demo", exp: 1983812996 })}`;
  return `${body}.${createHmac("sha256", JWT_SECRET).update(body).digest("base64url")}`;
}
const key = serviceRoleKey();
const authHeaders = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const pool = new Pool({ connectionString: DB_URL, max: 4 });
try {
  const { rows: [event] } = await pool.query(
    "select id, name, status from public.events where slug = $1 and deleted_at is null", [slug]);
  if (!event) throw new Error(`No event with slug "${slug}"`);
  if (event.status !== "published") console.warn(`Note: "${slug}" is ${event.status}; publish it to try it as an attendee.`);

  const emailPrefix = `demo-${slug}-`;
  if (reset) {
    const { rows } = await pool.query("select id from auth.users where email like $1", [`${emailPrefix}%@demo.test`]);
    for (const u of rows) await fetch(`${API}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: authHeaders });
    await pool.query("delete from public.accounts where user_id = any($1::uuid[])", [rows.map((r) => r.id)]);
    console.log(`Removed ${rows.length} previous demo attendees.`);
  }

  let { rows: tags } = await pool.query(
    "select id, label from public.interest_tags where event_id = $1 and is_official and not hidden and merged_into is null",
    [event.id]);
  if (tags.length < 3) {
    for (const label of DEFAULT_TAGS) {
      await pool.query(`insert into public.interest_tags (event_id, label, is_official) values ($1, $2, true)
                        on conflict (event_id, normalized) do nothing`, [event.id, label]);
    }
    ({ rows: tags } = await pool.query(
      "select id, label from public.interest_tags where event_id = $1 and is_official and not hidden and merged_into is null",
      [event.id]));
    console.log(`Event had fewer than 3 interests; added: ${DEFAULT_TAGS.join(", ")}`);
  }
  // Long-tail popularity so rarity weighting is visible: earlier tags are far more common.
  const weighted = tags.flatMap((t, i) => Array(Math.max(1, tags.length - i * 2)).fill(t));

  const { rows: [{ n: existing }] } = await pool.query("select count(*)::int as n from auth.users where email like $1",
    [`${emailPrefix}%@demo.test`]);
  const created: { email: string; name: string; interests: string[] }[] = [];
  for (let i = existing + 1; i <= existing + count; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const email = `${emailPrefix}${i}@demo.test`;
    const res = await fetch(`${API}/auth/v1/admin/users`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ email, email_confirm: true, user_metadata: { full_name: name } }),
    });
    if (!res.ok) throw new Error(`Creating ${email} failed: ${res.status} ${await res.text()}`);
    const { id: userId } = await res.json();

    await pool.query("update public.accounts set headline = $2, company = $3 where user_id = $1",
      [userId, pick(ROLES), pick(COMPANIES)]);
    const mine = new Map<string, string>();
    const want = 2 + Math.floor(Math.random() * 4);
    while (mine.size < Math.min(want, tags.length)) { const t = pick(weighted); mine.set(t.id, t.label); }
    const { rows: [att] } = await pool.query(
      `insert into public.attendees (event_id, user_id, joined_via, completed_at, bio, looking_for)
       values ($1, $2, 'link', now() - random() * interval '6 hours', $3, $4) returning id`,
      [event.id, userId, pick(BIOS), pick(LOOKING)]);
    await pool.query(`insert into public.attendee_interests (attendee_id, tag_id, event_id)
                      select $1, unnest($2::uuid[]), $3`, [att.id, [...mine.keys()], event.id]);
    created.push({ email, name, interests: [...mine.values()] });
  }

  // Rebuild match statistics now instead of waiting for the 30 s cron.
  await pool.query("select private.rebuild_dirty_event_stats()");

  console.log(`\nAdded ${count} demo attendees to "${event.name}" (${slug}).`);
  console.log("Sign in as any of them at the event's /join page; the code arrives in Mailpit (http://127.0.0.1:54324):\n");
  for (const c of created.slice(0, 5)) console.log(`  ${c.email.padEnd(34)} ${c.name.padEnd(22)} ${c.interests.join(", ")}`);
  if (created.length > 5) console.log(`  … and ${created.length - 5} more (${emailPrefix}<n>@demo.test)`);
} finally {
  await pool.end();
}
