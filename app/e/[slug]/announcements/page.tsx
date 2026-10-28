import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AnnouncementList, sortAnnouncements } from "@/components/events/announcement-list";
import { AttendeeShell } from "@/components/events/attendee-shell";
import { LiveRefresh } from "@/components/live-refresh";
import { getAttendance } from "@/lib/attendance";
import { inboxCount } from "@/lib/inbox";

export const metadata: Metadata = { title: "Announcements", robots: { index: false } };

export default async function AttendeeAnnouncementsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getAttendance(slug);
  if (!data) notFound();
  const { event, supabase, user, active } = data;
  if (!user || !active) redirect("/join");
  const [{ data: items }, badge] = await Promise.all([
    supabase.from("announcements").select("id, title, body, pinned, published_at")
      .eq("event_id", event.id).not("published_at", "is", null),
    inboxCount(supabase, event.id),
  ]);
  return (
    <AttendeeShell eventName={event.name} current="matches" inboxCount={badge} userId={user.id}>
      <LiveRefresh topic={`event:${event.id}`} events={["announcement"]} />
      <h1 className="text-2xl font-semibold">Announcements</h1>
      {items?.length ? <AnnouncementList items={sortAnnouncements(items)} timeZone={event.timezone} />
                     : <p className="text-muted">No announcements yet.</p>}
    </AttendeeShell>
  );
}
