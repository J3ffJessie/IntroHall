import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { AttendeeShell } from "@/components/events/attendee-shell";
import { ConnectConfirm, RememberConnect } from "@/components/events/connect-confirm";
import { buttonClass, Card } from "@/components/ui";
import { getAttendance } from "@/lib/attendance";

export const metadata: Metadata = { title: "Connect", robots: { index: false }, referrer: "no-referrer" };

/** Landing page of a personal connect QR code (scanned with the phone camera). */
export default async function ConnectPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token: raw } = await params;
  const token = decodeURIComponent(raw);
  const data = await getAttendance(slug);
  if (!data) notFound();
  const { event, supabase, user, active } = data;

  if (!user || !active || !active.completed_at) {
    const next = !user || !active ? { href: "/join", label: `Join ${event.name}` } : { href: "/setup", label: "Finish your profile" };
    return (
      <AttendeeShell eventName={event.name}>
        <RememberConnect token={token} />
        <Card title="You scanned someone's connect code">
          <p className="text-muted-foreground">
            {event.status === "archived"
              ? "This event has ended, so new connections are closed."
              : `${next.label} first. You'll come straight back here to connect.`}
          </p>
          {event.status !== "archived" && <Link href={next.href} className={`${buttonClass.primary} w-full`}>{next.label}</Link>}
        </Card>
      </AttendeeShell>
    );
  }

  const { data: rows } = await supabase.rpc("preview_connect_token", { p_token: token });
  const p = rows?.[0];
  const role = p ? [p.headline, p.company].filter(Boolean).join(" · ") : "";
  const first = p?.full_name.split(" ")[0] || "them";

  return (
    <AttendeeShell eventName={event.name} current="matches" userId={user.id}>
      {!p ? (
        <Card title="This code doesn't work">
          <p className="text-muted-foreground">It may have been reset, or it belongs to a different event. Ask them to show it again.</p>
          <Link href="/home" className={`${buttonClass.secondary} w-fit`}>Back to matches</Link>
        </Card>
      ) : (
        <Card title={p.state === "self" ? "That's your own code" : "Connect"}>
          <div className="flex items-center gap-3">
            <Avatar name={p.full_name} path={p.avatar_path} className="size-14" />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{p.full_name || "Attendee"}</p>
              {role && <p className="truncate text-sm text-muted-foreground">{role}</p>}
            </div>
          </div>
          {p.state === "available" && <ConnectConfirm slug={slug} token={token} name={p.full_name} />}
          {p.state === "connected" && (
            <>
              <p className="text-muted-foreground">You&apos;re already connected.</p>
              {p.conversation_id && (
                <Link href={`/chat/${p.conversation_id}`} className={`${buttonClass.primary} w-full`}>Message {first}</Link>
              )}
            </>
          )}
          {p.state === "unavailable" && (
            <p className="text-muted-foreground">You can&apos;t connect with this person right now.</p>
          )}
          {p.state === "self" && (
            <p className="text-muted-foreground">Have the other person scan it with their phone camera.</p>
          )}
        </Card>
      )}
    </AttendeeShell>
  );
}
