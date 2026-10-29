// Edge Function: deletes the calling user's own account. The app's server action forwards the
// user's access token; the account to delete always comes from that token, never from the body.
import { adminClient } from "../_shared/admin.ts";
import { BlockedError, deleteAccount } from "./delete.ts";

const admin = adminClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    await deleteAccount(admin, data.user.id);
    return Response.json({ deleted: true });
  } catch (e) {
    if (e instanceof BlockedError) return Response.json({ error: e.message }, { status: 409 });
    console.error("delete-account failed", data.user.id, e);
    return Response.json({ error: "We couldn't delete your account. Please try again." }, { status: 500 });
  }
});
