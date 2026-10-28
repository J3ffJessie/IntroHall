import type { Metadata } from "next";
import { AnnouncementComposer, AnnouncementRowActions } from "@/components/events/announcement-admin";
import { Card } from "@/components/ui";
import { getOrgEvent } from "@/lib/org-event";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsAdminPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event, supabase } = await getOrgEvent(eventId);
  const { data } = await supabase.from("announcements")
    .select("id, title, body, pinned, publish_at, published_at")
    .eq("event_id", eventId)
    .order("published_at", { ascending: false, nullsFirst: true })
    .order("publish_at", { ascending: true });
  const all = data ?? [];
  const scheduled = all.filter((a) => !a.published_at);
  const published = all.filter((a) => a.published_at);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: event.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  const live = event.status === "published";

  return (
    <main className="flex flex-col gap-6">
      <Card title="New announcement">
        {!live && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-fg">Publish the event to post announcements.</p>}
        <AnnouncementComposer eventId={eventId} timeZone={event.timezone} disabled={!live} />
      </Card>

      {scheduled.length > 0 && (
        <Card title={`Scheduled (${scheduled.length})`}>
          <ul className="flex flex-col divide-y divide-border">
            {scheduled.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className="font-medium">{a.title}{a.pinned && <span className="ml-2 text-xs text-muted">📌 pinned</span>}</p>
                <p className="text-sm text-muted">{a.publish_at ? `Posts ${fmt.format(new Date(a.publish_at))}` : "Draft"}</p>
                <AnnouncementRowActions eventId={eventId} id={a.id} pinned={a.pinned} scheduled />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`Posted (${published.length})`}>
        {published.length === 0 ? (
          <p className="text-muted">Nothing posted yet. Announcements appear on the event page and in attendees&apos; feeds.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {published.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className="font-medium">{a.pinned && <span aria-label="Pinned">📌 </span>}{a.title}</p>
                {a.body && <p className="whitespace-pre-line text-sm">{a.body}</p>}
                <p className="text-xs text-muted">{fmt.format(new Date(a.published_at!))}</p>
                <AnnouncementRowActions eventId={eventId} id={a.id} pinned={a.pinned} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
