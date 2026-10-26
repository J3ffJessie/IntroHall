import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AttendeeShell } from "@/components/events/attendee-shell";
import { HomeActions } from "@/components/events/home-actions";
import { buttonClass, Card } from "@/components/ui";
import { getAttendance } from "@/lib/attendance";
import { formatEventRange } from "@/lib/time";

export const metadata: Metadata = { title: "Your event", robots: { index: false } };

export default async function AttendeeHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getAttendance(slug);
  if (!data) notFound();
  const { event, supabase, user, active } = data;
  if (!user || !active) redirect("/join");
  if (!active.completed_at) redirect("/setup");

  const [{ data: account }, { data: interests }] = await Promise.all([
    supabase.from("accounts").select("full_name, headline, company").eq("user_id", user.id).single(),
    supabase.from("attendee_interests").select("interest_tags(label)").eq("attendee_id", active.id),
  ]);
  const labels = (interests ?? []).map((i) => i.interest_tags?.label).filter(Boolean).sort() as string[];
  const hidden = active.visibility === "hidden";
  const archived = event.status === "archived";

  return (
    <AttendeeShell eventName={event.name}>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">You&apos;re in{account?.full_name ? `, ${account.full_name.split(" ")[0]}` : ""}!</h1>
        <p className="text-muted">{formatEventRange(event.starts_at, event.ends_at, event.timezone)}</p>
      </div>

      {hidden && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-fg">
          Your profile is hidden. Other attendees can&apos;t find you, but your existing conversations continue.
        </p>
      )}

      <Card title="Your matches">
        <p className="text-muted">
          People who share your interests will appear here. Check back as more attendees join.
        </p>
      </Card>

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
