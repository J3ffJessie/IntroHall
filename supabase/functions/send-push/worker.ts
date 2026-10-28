// Push fan-out worker (§4.6). Reads jobs from pgmq, sends Web Push in batches of ≤ 500
// subscriptions per job, deletes subscriptions the push service reports gone (404/410),
// re-enqueues the job with a cursor when more remain, and archives it. A job read more than
// MAX_READS times (it kept crashing the worker) moves to the dead-letter queue.
// Delivery is at-least-once per batch: a crash mid-batch re-sends that batch after the
// visibility timeout.
import webpush from "npm:web-push@3.6.7";
import type postgres from "npm:postgres@3.4.5";

type Sql = ReturnType<typeof postgres>;

export type Job = {
  kind: string;
  event_id: string;
  user_id: string | null;
  title: string;
  body: string;
  url: string;
  tag: string;
  after_subscription_id: string | null;
};

export type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };
export type SendOutcome = "ok" | "gone" | "failed";
export type Sender = (sub: Subscription, payload: string) => Promise<SendOutcome>;

export type WorkerOptions = {
  queue?: string;
  dlq?: string;
  jobsPerRun?: number;
  visibilityTimeout?: number;
  perJob?: number;
  maxReads?: number;
  concurrency?: number;
};

export type RunStats = { jobs: number; sent: number; gone: number; failed: number; deadLettered: number; continued: number };

export function vapidSender(publicKey: string, privateKey: string, subject: string): Sender {
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return async (sub, payload) => {
    // web-push only builds the encrypted request; fetch sends it (works with any endpoint scheme).
    const req = webpush.generateRequestDetails(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 12 * 3600, urgency: "normal" });
    try {
      const res = await fetch(req.endpoint, {
        method: req.method, headers: req.headers as HeadersInit, body: req.body as BodyInit,
        signal: AbortSignal.timeout(10_000),
      });
      await res.body?.cancel();
      if (res.status === 404 || res.status === 410) return "gone";
      return res.ok ? "ok" : "failed";
    } catch {
      return "failed";
    }
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

export async function processQueue(sql: Sql, send: Sender, opts: WorkerOptions = {}): Promise<RunStats> {
  const queue = opts.queue ?? "push_jobs";
  const dlq = opts.dlq ?? "push_jobs_dlq";
  const perJob = opts.perJob ?? 500;
  const maxReads = opts.maxReads ?? 5;
  const stats: RunStats = { jobs: 0, sent: 0, gone: 0, failed: 0, deadLettered: 0, continued: 0 };

  const jobs = await sql<{ msg_id: number; read_ct: number; message: Job }[]>`
    select msg_id, read_ct, message from pgmq.read(${queue}, ${opts.visibilityTimeout ?? 60}, ${opts.jobsPerRun ?? 10})`;

  for (const job of jobs) {
    stats.jobs++;
    if (job.read_ct > maxReads) {
      await sql`select pgmq.send(${dlq}, ${sql.json({ ...job.message, msg_id: job.msg_id, read_ct: job.read_ct })})`;
      await sql`select pgmq.delete(${queue}, ${job.msg_id}::bigint)`;
      stats.deadLettered++;
      continue;
    }
    const m = job.message;
    // Live eligibility: only people still in the event (not left or banned) get pushes.
    // One extra row tells us whether a continuation job is needed.
    const page = await sql<Subscription[]>`
      select s.id, s.endpoint, s.p256dh, s.auth
        from public.push_subscription_events pse
        join public.push_subscriptions s on s.id = pse.subscription_id
        join public.attendees a on a.user_id = s.user_id and a.event_id = pse.event_id
       where pse.event_id = ${m.event_id}
         and a.left_at is null and a.banned_at is null
         and (${m.user_id}::uuid is null or s.user_id = ${m.user_id}::uuid)
         and (${m.after_subscription_id}::uuid is null or s.id > ${m.after_subscription_id}::uuid)
       order by s.id
       limit ${perJob + 1}`;
    const subs = page.slice(0, perJob);

    const payload = JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag, kind: m.kind });
    const results = await mapLimit(subs, opts.concurrency ?? 20, (s) => send(s, payload));
    const ok = subs.filter((_, i) => results[i] === "ok").map((s) => s.id);
    const gone = subs.filter((_, i) => results[i] === "gone").map((s) => s.id);
    stats.sent += ok.length;
    stats.gone += gone.length;
    stats.failed += results.filter((r) => r === "failed").length;

    if (ok.length) await sql`update public.push_subscriptions set last_success_at = now() where id = any(${ok}::uuid[])`;
    if (gone.length) await sql`delete from public.push_subscriptions where id = any(${gone}::uuid[])`;
    if (page.length > perJob) {
      await sql`select pgmq.send(${queue}, ${sql.json({ ...m, after_subscription_id: subs[subs.length - 1].id })})`;
      stats.continued++;
    }
    await sql`select pgmq.archive(${queue}, ${job.msg_id}::bigint)`;
  }
  return stats;
}
