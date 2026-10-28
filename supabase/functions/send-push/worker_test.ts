// deno test -A supabase/functions/send-push/worker_test.ts   (needs the local Supabase DB)
import postgres from "npm:postgres@3.4.5";
import { assertEquals } from "jsr:@std/assert@1";
import { type Job, processQueue, type Sender, vapidSender } from "./worker.ts";
import webpush from "npm:web-push@3.6.7";

const sql = postgres(Deno.env.get("DB_URL") ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 2, prepare: false });
const Q = "push_jobs_test";
const DLQ = "push_jobs_test_dlq";

// Mock push service: /gone/* answers 410, everything else 201. Records what it received.
const received: { path: string; encoding: string | null; bytes: number }[] = [];
const server = Deno.serve({ port: 0, onListen() {} }, async (req) => {
  const path = new URL(req.url).pathname;
  received.push({ path, encoding: req.headers.get("content-encoding"), bytes: (await req.arrayBuffer()).byteLength });
  return new Response(null, { status: path.startsWith("/gone/") ? 410 : 201 });
});
const base = `http://127.0.0.1:${server.addr.port}`;

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
async function browserKeys() {
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey))), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
}

const run = crypto.randomUUID().slice(0, 8);
const users: string[] = [];
let eventId = "";
let orgId = "";

async function fixture() {
  await sql`select pgmq.create(${Q})`;
  await sql`select pgmq.create(${DLQ})`;
  [{ id: orgId }] = await sql`insert into public.organizations (name, slug) values (${"push " + run}, ${"push-" + run}) returning id`;
  [{ id: eventId }] = await sql`
    insert into public.events (org_id, slug, name, starts_at, ends_at, timezone, status, published_at)
    values (${orgId}, ${"push-" + run}, 'Push test', now(), now() + interval '1 day', 'UTC', 'published', now()) returning id`;
  // 5 attendees: 3 healthy subscriptions, 1 gone (410), 1 who left the event.
  for (let i = 0; i < 5; i++) {
    const [{ id }] = await sql`insert into auth.users (id, email, aud, role) values (gen_random_uuid(), ${`p${i}-${run}@push.test`}, 'authenticated', 'authenticated') returning id`;
    users.push(id);
    await sql`insert into public.attendees (event_id, user_id, joined_via, completed_at, left_at)
              values (${eventId}, ${id}, 'link', now(), ${i === 4 ? new Date() : null})`;
    const k = await browserKeys();
    const endpoint = `${base}/${i === 3 ? "gone" : "ok"}/${i}`;
    const [{ id: sub }] = await sql`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                                    values (${id}, ${endpoint}, ${k.p256dh}, ${k.auth}) returning id`;
    await sql`insert into public.push_subscription_events (subscription_id, event_id) values (${sub}, ${eventId})`;
  }
}

const job = (over: Partial<Job> = {}): Job => ({
  kind: "announcement", event_id: eventId, user_id: null, title: "Doors open", body: "Keynote in 10 min",
  url: "/home", tag: "t", after_subscription_id: null, ...over,
});
const depth = async (q: string) => (await sql`select count(*)::int n from pgmq.${sql("q_" + q)}`)[0].n as number;

Deno.test({
  name: "send-push worker",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    await fixture();
    const keys = webpush.generateVAPIDKeys();
    const send = vapidSender(keys.publicKey, keys.privateKey, "mailto:test@introhall.com");
    const opts = { queue: Q, dlq: DLQ, visibilityTimeout: 0 };

    try {
      await t.step("fans out an announcement in batches, deletes gone subscriptions, skips people who left", async () => {
        await sql`select pgmq.send(${Q}, ${sql.json(job())})`;
        // perJob 2 forces a continuation job for the remaining subscriptions.
        let s = await processQueue(sql, send, { ...opts, perJob: 2 });
        assertEquals([s.jobs, s.continued], [1, 1]);
        s = await processQueue(sql, send, { ...opts, perJob: 2 });
        assertEquals(s.jobs, 1);
        assertEquals(received.filter((r) => r.path.startsWith("/ok/")).length, 3, "3 healthy subscribers");
        assertEquals(received.some((r) => r.path === "/ok/4"), false, "attendee who left gets nothing");
        assertEquals(received.every((r) => r.encoding === "aes128gcm" && r.bytes > 0), true, "payload encrypted");
        const [{ n }] = await sql`select count(*)::int n from public.push_subscriptions where endpoint = ${`${base}/gone/3`}`;
        assertEquals(n, 0, "410 subscription deleted");
        assertEquals(await depth(Q), 0, "jobs archived");
        assertEquals((await sql`select count(*)::int n from pgmq.${sql("a_" + Q)}`)[0].n, 2, "both jobs in the archive");
      });

      await t.step("targets one user's subscriptions", async () => {
        received.length = 0;
        await sql`select pgmq.send(${Q}, ${sql.json(job({ kind: "message", user_id: users[1] }))})`;
        await processQueue(sql, send, opts);
        assertEquals(received.map((r) => r.path), ["/ok/1"]);
      });

      await t.step("a job that keeps crashing the worker moves to the DLQ after 5 reads", async () => {
        await sql`select pgmq.send(${Q}, ${sql.json(job({ title: "poison" }))})`;
        const crash: Sender = () => { throw new Error("worker crashed"); };
        for (let i = 0; i < 5; i++) {
          await processQueue(sql, crash, opts).catch(() => {});
        }
        assertEquals(await depth(Q), 1, "still queued after 5 failed reads (retried, not lost)");
        const s = await processQueue(sql, send, opts);
        assertEquals(s.deadLettered, 1);
        assertEquals(await depth(Q), 0);
        const [dead] = await sql`select message from pgmq.read(${DLQ}, 0, 1)`;
        assertEquals([dead.message.title, dead.message.read_ct], ["poison", 6]);
      });
    } finally {
      await sql`select pgmq.drop_queue(${Q})`;
      await sql`select pgmq.drop_queue(${DLQ})`;
      await sql`delete from public.organizations where id = ${orgId}`;
      await sql`delete from auth.users where id = any(${users}::uuid[])`;
      await sql`delete from public.accounts where user_id = any(${users}::uuid[])`;
      await sql.end();
      await server.shutdown();
    }
  },
});
