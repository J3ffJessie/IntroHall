import type { Metadata } from "next";
import { ReportActions } from "@/components/events/report-actions";
import { LiveRefresh } from "@/components/live-refresh";
import { Card } from "@/components/ui";
import { getOrgEvent } from "@/lib/org-event";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event, supabase } = await getOrgEvent(eventId);
  const { data } = await supabase.rpc("get_reports", { p_event_id: eventId });
  const reports = data ?? [];
  const open = reports.filter((r) => r.status === "open");
  const resolved = reports.filter((r) => r.status === "resolved");
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: event.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <main className="flex flex-col gap-6">
      {/* New reports appear live; the poll is a fallback if the socket drops. */}
      <LiveRefresh topic={`moderation:${eventId}`} events={["report"]} pollMs={30_000} />
      <Card title={`Open reports (${open.length})`}>
        <p className="text-sm text-muted">
          You see a copy of the reported message, never the rest of the conversation. Copies are kept until you resolve the report.
        </p>
        {open.length === 0 ? (
          <p className="text-muted">Nothing to review.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {open.map((r) => {
              const snap = (r.sender_snapshot ?? {}) as { headline?: string; company?: string; bio?: string };
              return (
                <li key={r.report_id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">
                      {r.target_name}
                      {r.target_banned && <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger">Banned</span>}
                      {!r.target_banned && r.target_left && <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">Removed / left</span>}
                    </p>
                    <span className="text-xs text-muted">Reported by {r.reporter_name} · {fmt.format(new Date(r.reported_at))}</span>
                  </div>
                  {(snap.headline || snap.company) && <p className="text-sm text-muted">{[snap.headline, snap.company].filter(Boolean).join(" · ")}</p>}
                  <p><span className="font-medium">Reason:</span> {r.reason}</p>
                  {r.message_snapshot && (
                    <blockquote className="rounded-lg bg-surface-muted px-3 py-2 text-sm">
                      <span className="mb-1 block text-xs font-medium text-muted">Reported message</span>
                      “{r.message_snapshot}”
                    </blockquote>
                  )}
                  <ReportActions eventId={eventId} reportId={r.report_id} attendeeId={r.target_attendee}
                                 name={r.target_name} banned={r.target_banned} left={r.target_left} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {resolved.length > 0 && (
        <Card title={`Resolved (${resolved.length})`}>
          <ul className="divide-y divide-border text-sm">
            {resolved.map((r) => (
              <li key={r.report_id} className="py-2">
                <span className="font-medium">{r.target_name}</span>: {r.reason}
                <span className="text-muted"> · resolved {r.resolved_at ? fmt.format(new Date(r.resolved_at)) : ""}
                  {r.resolution_note ? ` · “${r.resolution_note}”` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
