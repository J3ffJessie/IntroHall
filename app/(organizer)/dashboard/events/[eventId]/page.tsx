import type { Metadata } from "next";
import { Card, StatusBadge } from "@/components/ui";
import { StatusControls } from "@/components/events/status-controls";
import { PROTOCOL, ROOT_DOMAIN } from "@/lib/env";
import { getOrgEvent } from "@/lib/org-event";
import { formatEventRange } from "@/lib/time";

export const metadata: Metadata = { title: "Event" };

export default async function EventOverviewPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event, role, supabase } = await getOrgEvent(eventId);
  const { count: tagCount } = await supabase.from("interest_tags")
    .select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("hidden", false);
  const url = `${PROTOCOL}://${event.slug}.${ROOT_DOMAIN}/`;

  const checklist = [
    { done: true, label: "Details" },
    { done: (tagCount ?? 0) >= 3, label: "At least 3 interests for attendees to pick" },
  ];
  // Code-mode events without a code are blocked by publish_event() itself.

  return (
    <main className="flex flex-col gap-6">
      <Card title="Status">
        <p>
          <StatusBadge status={event.status} />
          <span className="ml-2 text-muted">{formatEventRange(event.starts_at, event.ends_at, event.timezone)}</span>
        </p>
        <p className="text-sm">
          Event page: <a href={url} className="break-all text-primary underline underline-offset-2 hover:text-primary-hover">{url}</a>
          {event.status !== "published" && <span className="text-muted"> (visible after publishing)</span>}
        </p>
        <StatusControls eventId={eventId} status={event.status} canArchive={role !== "staff"} />
      </Card>
      {event.status === "draft" && (
        <Card title="Before you publish">
          <ul className="flex flex-col gap-1 text-sm">
            {checklist.map((c) => (
              <li key={c.label}>
                <span aria-hidden className={c.done ? "text-success" : "text-muted"}>{c.done ? "✓" : "○"}</span>{" "}
                <span className={c.done ? "" : "text-muted"}>{c.label}</span>
                <span className="sr-only">{c.done ? " (done)" : " (to do)"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
