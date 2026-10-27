import type { Connection } from "@/components/events/connect-button";

type Row = { direction: string; status: string; other_attendee: string; request_id: string; conversation_id: string | null };

/** Match-card state per other attendee, from get_connections() rows. */
export function connectionMap(rows: Row[]): Map<string, Connection> {
  const map = new Map<string, Connection>();
  for (const r of rows) {
    if (r.status === "accepted") map.set(r.other_attendee, { state: "connected", conversationId: r.conversation_id });
    else if (r.status === "pending" && r.direction === "incoming") map.set(r.other_attendee, { state: "incoming", requestId: r.request_id });
    else if (r.status === "pending") map.set(r.other_attendee, { state: "outgoing" });
  }
  return map;
}
