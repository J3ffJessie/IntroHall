// deno test -A supabase/functions/purge-events/   (needs the local Supabase stack: API + DB)
import postgres from "npm:postgres@3.4.5";
import { assertEquals } from "jsr:@std/assert@1";
import { adminClient } from "../_shared/admin.ts";
import { purgeDeleted } from "./purge.ts";

const sql = postgres(Deno.env.get("DB_URL") ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 2, prepare: false });
// Well-known local demo service key (same as supabase/seed.sql).
const admin = adminClient(Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU");
const run = crypto.randomUUID().slice(0, 8);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

Deno.test("purges events deleted over 30 days ago with their files, then the empty org", async () => {
  const [{ id: orgId }] = await sql`insert into public.organizations (name, slug, deleted_at)
                                    values (${"Purge " + run}, ${"purge-" + run}, now() - interval '31 days') returning id`;
  const mk = async (tag: string, deletedAgo: string) => {
    const [{ id }] = await sql`
      insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, deleted_at)
      values (${orgId}, ${`purge-${tag}-${run}`}, ${tag}, now(), now() + interval '1 day', 'UTC', now() - ${deletedAgo}::interval)
      returning id`;
    const { error } = await admin.storage.from("event-assets").upload(`${orgId}/${id}/banner.png`, png, { contentType: "image/png" });
    if (error) throw error;
    return id as string;
  };
  const old = await mk("old", "31 days");
  const recent = await mk("recent", "10 days");

  const first = await purgeDeleted(admin);
  assertEquals(first.events >= 1 && first.files >= 1, true);
  assertEquals((await sql`select id from public.events where id in (${old}, ${recent})`).map((r) => r.id), [recent]);
  assertEquals((await admin.storage.from("event-assets").list(`${orgId}/${old}`)).data, [], "old event's files removed");
  assertEquals((await admin.storage.from("event-assets").list(`${orgId}/${recent}`)).data?.length, 1, "recent event's files kept");
  assertEquals((await sql`select count(*)::int as n from public.organizations where id = ${orgId}`)[0].n, 1,
               "org kept while it still has an event");

  await sql`update public.events set deleted_at = now() - interval '31 days' where id = ${recent}`;
  await purgeDeleted(admin);
  assertEquals((await sql`select count(*)::int as n from public.organizations where id = ${orgId}`)[0].n, 0, "empty org purged");
  await sql.end();
});
