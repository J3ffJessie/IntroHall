import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Returns the signed-in user and a user-scoped client, or redirects to /login. */
export async function requireUser(returnTo: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return { supabase, user };
}
