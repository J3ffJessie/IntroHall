// Edge Function invoked daily by pg_cron (via pg_net) when deleted events or orgs are due for purging.
import { adminClient } from "../_shared/admin.ts";
import { purgeDeleted } from "./purge.ts";

const admin = adminClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  // Only the database's own cron job may run the purge.
  if (req.headers.get("authorization") !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    return Response.json(await purgeDeleted(admin));
  } catch (e) {
    console.error("purge-events failed", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
