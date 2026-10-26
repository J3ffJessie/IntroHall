"use server";

import { redirect } from "next/navigation";
import { getAttendance } from "@/lib/attendance";
import { friendlyDbError } from "@/lib/db-errors";
import { parseEventProfileForm } from "@/lib/event-profile";
import { fail, type FormState } from "@/lib/form-state";

async function requireActive(slug: string) {
  const data = await getAttendance(slug);
  if (!data?.user) redirect("/join");
  if (!data.active) redirect("/join");
  return { ...data, user: data.user, active: data.active };
}

export async function saveEventProfile(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parseEventProfileForm(form);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { supabase, user, event, active } = await requireActive(slug);
  const v = parsed.data;

  const { error: accErr } = await supabase.from("accounts")
    .update({ full_name: v.full_name, headline: v.headline, company: v.company }).eq("user_id", user.id);
  if (accErr) return fail(friendlyDbError(accErr));
  const { error: attErr } = await supabase.from("attendees")
    .update({ bio: v.bio, looking_for: v.looking_for }).eq("id", active.id);
  if (attErr) return fail(friendlyDbError(attErr));
  const { error } = await supabase.rpc("upsert_interests", {
    p_event_id: event.id, p_tag_ids: v.tag_ids, p_custom_labels: v.custom,
  });
  if (error) return fail(friendlyDbError(error));
  redirect("/home");
}

export async function setProfileVisibility(slug: string, visibility: "visible" | "hidden"): Promise<void> {
  const { supabase, active } = await requireActive(slug);
  await supabase.from("attendees").update({ visibility }).eq("id", active.id);
  redirect("/me");
}

export async function leaveEvent(slug: string): Promise<void> {
  const { supabase, event } = await requireActive(slug);
  await supabase.rpc("leave_event", { p_event_id: event.id });
  redirect("/");
}
