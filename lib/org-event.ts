import { notFound } from "next/navigation";
import { cache } from "react";
import { requireUser } from "@/lib/auth/require-user";

/** Loads an event the signed-in user can manage (RLS: org members only), deduped per request. */
export const getOrgEvent = cache(async (eventId: string) => {
  const { supabase, user } = await requireUser(`/dashboard/events/${eventId}`);
  const { data: event } = await supabase
    .from("events")
    .select(`id, org_id, slug, name, description, venue, starts_at, ends_at, timezone, status, published_at,
             join_mode, allow_custom_interests, max_custom_interests, retention_days,
             organizations(name)`)
    .eq("id", eventId)
    .maybeSingle();
  // Published events are publicly readable, so also require membership of the owning org.
  if (!event) notFound();
  const { data: membership } = await supabase
    .from("org_members").select("role").eq("org_id", event.org_id).eq("user_id", user.id).maybeSingle();
  if (!membership) notFound();
  return { supabase, user, event, role: membership.role };
});
