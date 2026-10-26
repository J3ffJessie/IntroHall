import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { AttendeeShell } from "@/components/events/attendee-shell";
import { JoinRunner } from "@/components/events/join-runner";
import { Card } from "@/components/ui";
import { getAttendance } from "@/lib/attendance";

export const metadata: Metadata = { title: "Join", robots: { index: false } };

export default async function JoinPage({ params, searchParams }:
  { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> }) {
  const { slug } = await params;
  const { c } = await searchParams;
  const data = await getAttendance(slug);
  if (!data) notFound();
  const { event, user, attendee, active } = data;

  if (active) redirect(active.completed_at ? "/home" : "/setup");

  const legal = (
    <p className="text-sm text-muted">
      By joining you agree to the <Link href="/legal/terms" className="text-primary underline">Terms</Link> and{" "}
      <Link href="/legal/privacy" className="text-primary underline">Privacy Policy</Link>.
    </p>
  );

  return (
    <AttendeeShell eventName={event.name}>
      {event.status === "archived" ? (
        <Card title="This event has ended">
          <p className="text-muted">Joining is closed.</p>
        </Card>
      ) : attendee?.banned_at ? (
        <Card title="You can't join this event">
          <p className="text-muted">The organizer removed you from this event. Contact them if you think this is a mistake.</p>
        </Card>
      ) : !user ? (
        <Card title={`Join ${event.name}`}>
          <p className="text-muted">Sign in with your email to meet people who share your interests. No password needed.</p>
          <LoginForm next={c ? `/join?c=${encodeURIComponent(c)}` : "/join"} />
          {legal}
        </Card>
      ) : (
        <Card title={`Join ${event.name}`}>
          <JoinRunner slug={slug} initialCode={c ?? null} />
          {legal}
        </Card>
      )}
    </AttendeeShell>
  );
}
