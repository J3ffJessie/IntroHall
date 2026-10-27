"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { friendlyDbError } from "@/lib/db-errors";
import { parseEventForm } from "@/lib/event-form";
import { done, fail, type FormState } from "@/lib/form-state";
import { normalizeTagLabel } from "@/lib/tags";

const path = (eventId: string, sub = "") => `/dashboard/events/${eventId}${sub}`;

/** Public event pages are ISR-cached; refresh them after any visible change. */
async function revalidatePublic(eventId: string) {
  const { supabase } = await requireUser(path(eventId));
  const { data } = await supabase.from("events").select("slug").eq("id", eventId).maybeSingle();
  if (data) revalidatePath(`/e/${data.slug}`);
}

export async function updateEvent(eventId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parseEventForm(form);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { supabase } = await requireUser(path(eventId, "/details"));
  const { error } = await supabase.from("events").update(parsed.data).eq("id", eventId);
  if (error) return fail(friendlyDbError(error));
  revalidatePath(path(eventId), "layout");
  await revalidatePublic(eventId);
  return done("Saved");
}

type StatusAction = "publish" | "unpublish" | "archive";
const statusRpc = { publish: "publish_event", unpublish: "unpublish_event", archive: "archive_event" } as const;

export async function setEventStatus(eventId: string, action: StatusAction): Promise<string | null> {
  const { supabase } = await requireUser(path(eventId));
  const { error } = await supabase.rpc(statusRpc[action], { p_event_id: eventId });
  if (error) return friendlyDbError(error);
  revalidatePath(path(eventId), "layout");
  await revalidatePublic(eventId);
  return null;
}

const assetSchema = z.object({
  kind: z.enum(["banner", "share"]),
  storage_path: z.string().min(1).max(300),
  alt: z.string().trim().max(200),
  width: z.number().int().min(1).max(20000).nullable(),
  height: z.number().int().min(1).max(20000).nullable(),
});

/** Records an uploaded image, replacing the event's previous image of that kind (row and storage object). */
export async function addAsset(eventId: string, input: z.input<typeof assetSchema>): Promise<string | null> {
  const parsed = assetSchema.safeParse(input);
  if (!parsed.success) return "Invalid upload.";
  const { supabase } = await requireUser(path(eventId, "/branding"));

  const { data: old } = await supabase.from("event_assets").select("id, storage_path")
    .eq("event_id", eventId).eq("kind", parsed.data.kind).maybeSingle();
  if (old) {
    await supabase.from("event_assets").delete().eq("id", old.id);
    await supabase.storage.from("event-assets").remove([old.storage_path]);
  }
  const { error } = await supabase.from("event_assets").insert({ ...parsed.data, event_id: eventId });
  if (error) {
    await supabase.storage.from("event-assets").remove([parsed.data.storage_path]);
    return friendlyDbError(error);
  }
  revalidatePath(path(eventId, "/branding"));
  await revalidatePublic(eventId);
  return null;
}

export async function removeAsset(eventId: string, assetId: string): Promise<void> {
  const { supabase } = await requireUser(path(eventId, "/branding"));
  const { data } = await supabase.from("event_assets").delete().eq("id", assetId).select("storage_path").maybeSingle();
  if (data) await supabase.storage.from("event-assets").remove([data.storage_path]);
  revalidatePath(path(eventId, "/branding"));
  await revalidatePublic(eventId);
}

export async function addTag(eventId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const label = normalizeTagLabel(String(form.get("label") ?? ""));
  if (!label) return fail("Enter an interest");
  if (label.length > 40) return fail("Interests are at most 40 characters");
  const { supabase } = await requireUser(path(eventId, "/tags"));
  const { error } = await supabase.from("interest_tags").insert({ event_id: eventId, label });
  if (error) return fail(friendlyDbError(error));
  revalidatePath(path(eventId, "/tags"));
  await revalidatePublic(eventId);
  return done(`Added “${label}”`);
}

export async function setTagHidden(eventId: string, tagId: string, hidden: boolean): Promise<void> {
  const { supabase } = await requireUser(path(eventId, "/tags"));
  await supabase.from("interest_tags").update({ hidden }).eq("id", tagId).eq("event_id", eventId);
  revalidatePath(path(eventId, "/tags"));
  await revalidatePublic(eventId);
}

export async function setJoinMode(eventId: string, mode: "open" | "code"): Promise<string | null> {
  const { supabase } = await requireUser(path(eventId, "/access"));
  const { error } = await supabase.from("events").update({ join_mode: mode }).eq("id", eventId);
  if (error) return friendlyDbError(error);
  revalidatePath(path(eventId), "layout");
  return null;
}

/** Returns the new plaintext code; it is never retrievable again (§4.2). */
export async function rotateJoinCode(eventId: string): Promise<{ code?: string; error?: string }> {
  const { supabase } = await requireUser(path(eventId, "/access"));
  const { data, error } = await supabase.rpc("rotate_join_code", { p_event_id: eventId });
  if (error) return { error: friendlyDbError(error) };
  return { code: data };
}

export async function moderateAttendee(eventId: string, attendeeId: string, action: "remove" | "ban" | "unban"): Promise<string | null> {
  const { supabase } = await requireUser(path(eventId, "/attendees"));
  const { error } = action === "unban"
    ? await supabase.rpc("unban_attendee", { p_attendee_id: attendeeId })
    : await supabase.rpc("remove_attendee", { p_attendee_id: attendeeId, p_ban: action === "ban" });
  if (error) return friendlyDbError(error);
  revalidatePath(path(eventId, "/attendees"));
  revalidatePath(path(eventId, "/reports"));
  return null;
}

export async function resolveReport(eventId: string, reportId: string, note: string): Promise<string | null> {
  const { supabase } = await requireUser(path(eventId, "/reports"));
  const { error } = await supabase.rpc("resolve_report", { p_report_id: reportId, p_note: note });
  if (error) return friendlyDbError(error);
  revalidatePath(path(eventId, "/reports"));
  return null;
}
