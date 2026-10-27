import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/** Badge count for the Inbox tab: incoming requests + unread messages. */
export async function inboxCount(supabase: SupabaseClient<Database>, eventId: string): Promise<number> {
  const [{ data: conns }, { data: convs }] = await Promise.all([
    supabase.rpc("get_connections", { p_event_id: eventId }),
    supabase.rpc("get_conversations", { p_event_id: eventId }),
  ]);
  const incoming = (conns ?? []).filter((c) => c.direction === "incoming" && c.status === "pending").length;
  const unread = (convs ?? []).reduce((n, c) => n + (c.unread ?? 0), 0);
  return incoming + unread;
}
