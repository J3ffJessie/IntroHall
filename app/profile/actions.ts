"use server";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { fail, type FormState } from "@/lib/form-state";
import { parseProfileForm } from "@/lib/profile";

export type ProfileState = { ok: boolean; message: string | null };

export async function updateProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const parsed = parseProfileForm(form);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { supabase, user } = await requireUser("/profile");
  const { error } = await supabase.from("accounts").update(parsed.data).eq("user_id", user.id);
  if (error) return { ok: false, message: "Could not save your profile. Please try again." };

  revalidatePath("/profile");
  return { ok: true, message: "Saved" };
}

/** Runs the delete-account Edge Function as the signed-in user, then clears the session cookies. */
export async function deleteAccount(_prev: FormState, form: FormData): Promise<FormState> {
  if (String(form.get("confirm") ?? "").trim() !== "DELETE") return fail("Type DELETE to confirm");
  const { supabase } = await requireUser("/profile");
  const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
  if (error) {
    const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    return fail(body?.error ?? "We couldn't delete your account. Please try again.");
  }
  // The auth user is gone, so only the local cookies can be cleared.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?deleted=1");
}
