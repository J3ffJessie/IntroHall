import type { Metadata } from "next";
import { AnalyticsView } from "@/components/events/analytics-view";
import { parseAnalytics } from "@/lib/analytics";
import { getOrgEvent } from "@/lib/org-event";

export const metadata: Metadata = { title: "Analytics" };
// Live counts on every visit.
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { supabase } = await getOrgEvent(eventId);
  const { data, error } = await supabase.rpc("get_event_analytics", { p_event_id: eventId });
  if (error) throw new Error(error.message);
  return (
    <main className="flex flex-col gap-2">
      <p className="text-sm text-muted">Hours and days are in the event&apos;s time zone. Totals only; no one&apos;s activity is tracked individually.</p>
      <AnalyticsView data={parseAnalytics(data)} />
    </main>
  );
}
