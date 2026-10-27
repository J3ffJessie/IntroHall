import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AttendeeShell } from "@/components/events/attendee-shell";
import { HomeActions } from "@/components/events/home-actions";
import { buttonClass, Card } from "@/components/ui";
import { getAttendance } from "@/lib/attendance";
import { inboxCount } from "@/lib/inbox";
import { formatEventRange } from "@/lib/time";

export const metadata: Metadata = { title: "My profile", robots: { index: false } };

export default async function MyProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getAttendance(slug);
  if (!data) notFound();
  const { event, supabase, user, active } = data;
  if (!user || !active) redirect("/join");
  if (!active.completed_at) redirect("/setup");

  const [{ data: account }, { data: interests }, badge] = await Promise.all([
    supabase.from("accounts").select("full_name, headline, company").eq("user_id", user.id).single(),
    supabase.from("attendee_interests").select("interest_tags(label)").eq("attendee_id", active.id),
    inboxCount(supabase, event.id),
  ]);
  const labels = (interests ?? []).map((i) => i.interest_tags?.label).filter(Boolean).sort() as string[];
  const hidden = active.visibility === "hidden";
  const archived = event.status === "archived";

  return (
    <AttendeeShell eventName={event.name} current="me" inboxCount={badge} userId={user.id}>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">My profile</h1>
        <p className="text-muted">{formatEventRange(event.starts_at, event.ends_at, event.timezone)}</p>
      </div>

      {hidden && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-fg">
          Your profile is hidden. Other attendees can&apos;t find you, but your existing conversations continue.
        </p>
      )}

      <Card title="Your profile"
            action={!archived && <Link href="/setup" className="text-sm text-primary underline">Edit</Link>}>
        <div>
          <p className="font-medium">{account?.full_name}</p>
          {(account?.headline || account?.company) && (
            <p className="text-sm text-muted">{[account?.headline, account?.company].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        {active.bio && <p className="whitespace-pre-line">{active.bio}</p>}
        {active.looking_for && <p><span className="font-medium">Looking for:</span> {active.looking_for}</p>}
        <ul className="flex flex-wrap gap-2" aria-label="Your interests">
          {labels.map((l) => (
            <li key={l} className="rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary-soft-fg">{l}</li>
          ))}
        </ul>
      </Card>

      {!archived && <HomeActions slug={slug} hidden={hidden} eventName={event.name} />}
      <Link href="/" className={`${buttonClass.secondary} w-fit`}>Event page</Link>
    </AttendeeShell>
  );
}
