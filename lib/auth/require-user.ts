import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Returns the signed-in user and a user-scoped client, or redirects to /login. */
export async function requireUser(returnTo: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return { supabase, user };
}

/** Builds the /welcome URL that comes back to `returnTo` once the profile has a name. */
export function welcomeUrl(returnTo: string): string {
  return `/welcome?next=${encodeURIComponent(returnTo)}`;
}

/**
 * Like requireUser, but organizers must set up their profile (at least a name) first, so teammates
 * never see an "Unnamed member". Nameless accounts go to /welcome and come back to `returnTo`.
 */
export async function requireNamedUser(returnTo: string) {
  const { supabase, user } = await requireUser(returnTo);
  const { data: account } = await supabase.from("accounts").select("full_name").eq("user_id", user.id).maybeSingle();
  if (!account?.full_name?.trim()) redirect(welcomeUrl(returnTo));
  return { supabase, user };
}
