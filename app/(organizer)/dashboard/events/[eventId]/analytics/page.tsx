import type { Metadata } from "next";
import { DownloadSimple, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { AnalyticsView } from "@/components/events/analytics-view";
import { PrintButton } from "@/components/print-button";
import { buttonClass, Card } from "@/components/ui";
import { parseAnalytics } from "@/lib/analytics";
import { eventHasEnded, summaryHighlights } from "@/lib/analytics-export";
import { getOrgEvent } from "@/lib/org-event";
import { formatEventRange } from "@/lib/time";

export const metadata: Metadata = { title: "Analytics" };
// Live counts on every visit.
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { supabase, event } = await getOrgEvent(eventId);
  const { data, error } = await supabase.rpc("get_event_analytics", { p_event_id: eventId });
  if (error) throw new Error(error.message);
  const analytics = parseAnalytics(data);
  const ended = eventHasEnded(event);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">Hours and days are in the event&apos;s time zone. Totals only; no one&apos;s activity is tracked individually.</p>
        {/* A plain link: the route answers with a file download. */}
        <a href={`/dashboard/events/${eventId}/analytics/export`} download className={`${buttonClass.secondary} w-fit`}>
          <DownloadSimple aria-hidden weight="duotone" /> Download CSV
        </a>
      </div>

      {ended && (
        <Card title="Post-event summary" icon={<Sparkle weight="duotone" />}>
          <p className="text-sm text-muted-foreground">
            {event.name} · {formatEventRange(event.starts_at, event.ends_at, event.timezone)}
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {summaryHighlights(analytics).map((h) => <li key={h}>{h}</li>)}
          </ul>
          <PrintButton label="Print summary" />
        </Card>
      )}

      <AnalyticsView data={analytics} />
    </main>
  );
}
