"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
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
