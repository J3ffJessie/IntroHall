// deno test -A supabase/functions/delete-account/   (needs the local Supabase stack: API + DB)
import postgres from "npm:postgres@3.4.5";
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { adminClient } from "../_shared/admin.ts";
import { BlockedError, deleteAccount } from "./delete.ts";

const sql = postgres(Deno.env.get("DB_URL") ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 2, prepare: false });
// Well-known local demo service key (same as supabase/seed.sql).
const admin = adminClient(Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU");
const run = crypto.randomUUID().slice(0, 8);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

async function newUser(tag: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: `${tag}-${run}@del.test`, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

Deno.test("deletes data, avatar files and the auth user; blocks sole owners", async () => {
  const uid = await newUser("member");
  const owner = await newUser("owner");
  const [{ id: orgId }] = await sql`insert into public.organizations (name, slug) values (${"Del " + run}, ${"del-" + run}) returning id`;
  await sql`insert into public.org_members (org_id, user_id, role) values (${orgId}, ${owner}, 'owner'), (${orgId}, ${uid}, 'staff')`;
  const [{ id: eventId }] = await sql`
    insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
    values (${orgId}, ${"del-" + run}, 'Del', now(), now() + interval '1 day', 'UTC', 'published', now()) returning id`;
  await sql`insert into public.attendees (event_id, user_id, joined_via, completed_at) values (${eventId}, ${uid}, 'link', now())`;
  for (const path of [`${uid}/avatar.png`, `${uid}/old/avatar.png`]) {
    const { error } = await admin.storage.from("avatars").upload(path, png, { contentType: "image/png" });
    if (error) throw error;
  }

  await assertRejects(() => deleteAccount(admin, owner), BlockedError);
  assertEquals((await admin.auth.admin.getUserById(owner)).data.user?.id, owner, "a blocked owner keeps their login");

  await deleteAccount(admin, uid);
  assertEquals((await admin.storage.from("avatars").list(uid)).data, [], "avatars/{uid} is empty");
  assertEquals((await admin.storage.from("avatars").list(`${uid}/old`)).data, []);
  assertEquals((await admin.auth.admin.getUserById(uid)).data.user, null, "auth user gone");
  const [acct] = await sql`select full_name, deleted_at is not null as deleted from public.accounts where user_id = ${uid}`;
  assertEquals(acct, { full_name: "Deleted user", deleted: true });
  assertEquals((await sql`select count(*)::int as n from public.attendees where user_id = ${uid}`)[0].n, 0);

  await deleteAccount(admin, uid); // retry after success is harmless

  await sql`delete from public.events where id = ${eventId}`;
  await sql`delete from public.organizations where id = ${orgId}`;
  await admin.auth.admin.deleteUser(owner);
  await sql.end();
});
