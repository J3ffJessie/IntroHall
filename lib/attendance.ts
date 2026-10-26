import { cache } from "react";
import { getPublicEvent } from "@/lib/public-event";
import { createClient } from "@/lib/supabase/server";

/** The public event plus the signed-in user's attendee row for it (if any). Null → 404. */
export const getAttendance = cache(async (slug: string) => {
  const data = await getPublicEvent(slug);
  if (!data) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: attendee } = user
    ? await supabase.from("attendees")
        .select("id, bio, looking_for, visibility, completed_at, left_at, banned_at")
        .eq("event_id", data.event.id).eq("user_id", user.id).maybeSingle()
    : { data: null };
  const active = attendee && !attendee.left_at && !attendee.banned_at ? attendee : null;
  return { ...data, supabase, user, attendee, active };
});
