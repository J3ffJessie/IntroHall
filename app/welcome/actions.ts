"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { safeNext } from "@/lib/auth/safe-next";
import { fail, type FormState } from "@/lib/form-state";
import { parseWelcomeForm } from "@/lib/profile";

/** First-run profile for organizers: saves name, headline and company, then continues to `next`. */
export async function completeProfile(next: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parseWelcomeForm(form);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");
  const { supabase, user } = await requireUser("/welcome");
  const { error } = await supabase.from("accounts").update(parsed.data).eq("user_id", user.id);
  if (error) return fail("Could not save your profile. Please try again.");
  redirect(safeNext(next, "/dashboard"));
}
