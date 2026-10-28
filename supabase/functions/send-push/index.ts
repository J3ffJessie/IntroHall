// Edge Function invoked by pg_cron (via pg_net) every 10 s while push_jobs has visible work.
import postgres from "npm:postgres@3.4.5";
import { processQueue, vapidSender } from "./worker.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 2, prepare: false });
const send = vapidSender(
  Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!, Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@introhall.com");

Deno.serve(async (req) => {
  // Only the database's own trigger may run the worker.
  if (req.headers.get("authorization") !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("Forbidden", { status: 403, headers: { "x-worker-version": "2" } });
  }
  try {
    return Response.json(await processQueue(sql, send));
  } catch (e) {
    // Jobs stay queued (not archived) and are retried after the visibility timeout.
    console.error("send-push failed", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
