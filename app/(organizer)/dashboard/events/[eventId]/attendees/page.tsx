import type { Metadata } from "next";
import { RosterActions } from "@/components/events/roster-actions";
import { Card } from "@/components/ui";
import { getOrgEvent } from "@/lib/org-event";

export const metadata: Metadata = { title: "Attendees" };

function statusOf(r: { completed_at: string | null; left_at: string | null; banned_at: string | null }) {
  if (r.banned_at) return { label: "Banned", cls: "bg-danger-soft text-danger" };
  if (r.left_at) return { label: "Left", cls: "bg-surface-muted text-muted" };
  if (!r.completed_at) return { label: "Setting up", cls: "bg-warning-soft text-warning-fg" };
  return { label: "Active", cls: "bg-success-soft text-success" };
}

export default async function AttendeesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event, supabase } = await getOrgEvent(eventId);
  const { data: roster } = await supabase.rpc("get_event_roster", { p_event_id: eventId });
  const rows = roster ?? [];
  const active = rows.filter((r) => !r.left_at && !r.banned_at).length;
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: event.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <main className="flex flex-col gap-6">
      <Card title={`Attendees (${active})`}>
        <p className="text-sm text-muted">
          Names and roles only. Bios, interests and messages stay private to attendees; you&apos;ll see interests as
          totals in analytics.
        </p>
        {rows.length === 0 ? (
          <p className="text-muted">No one has joined yet. Share the event link or QR code.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const s = statusOf(r);
              return (
                <li key={r.attendee_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {r.full_name || "Unnamed attendee"}
                      <span className={`ml-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
                    </p>
                    <p className="truncate text-sm text-muted">
                      {[r.headline, r.company].filter(Boolean).join(" · ") || "—"} · joined {fmt.format(new Date(r.joined_at))}
                    </p>
                  </div>
                  <RosterActions eventId={eventId} attendeeId={r.attendee_id} name={r.full_name || "this attendee"}
                                 banned={Boolean(r.banned_at)} left={Boolean(r.left_at)} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </main>
  );
}
