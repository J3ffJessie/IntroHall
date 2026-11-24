import { NextResponse } from "next/server";
import { parseAnalytics } from "@/lib/analytics";
import { analyticsCsv, analyticsFilename } from "@/lib/analytics-export";
import { createClient } from "@/lib/supabase/server";

// Analytics as a CSV file for the event's organizers (totals only, like the analytics page).
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  // get_event_analytics raises 42501 for anyone outside the event's organization.
  const [analytics, interests, event] = await Promise.all([
    supabase.rpc("get_event_analytics", { p_event_id: eventId }),
    supabase.rpc("get_announcement_audiences", { p_event_id: eventId }),
    supabase.from("events").select("name, slug, starts_at, ends_at, timezone").eq("id", eventId).maybeSingle(),
  ]);
  const error = analytics.error ?? interests.error;
  if (error || !event.data) {
    const forbidden = !event.data || error?.code === "42501" || error?.code === "22P02";
    return NextResponse.json({ error: forbidden ? "Event not found" : "Export failed. Please try again." },
                             { status: forbidden ? 404 : 500 });
  }

  const body = analyticsCsv(parseAnalytics(analytics.data),
                            (interests.data ?? []).map((t) => ({ label: t.label, attendees: t.attendees })), event.data);
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${analyticsFilename(event.data.slug)}"`,
      "cache-control": "no-store",
    },
  });
}
