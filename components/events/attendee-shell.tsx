import Link from "next/link";
import type { ReactNode } from "react";
import { LiveRefresh } from "@/components/live-refresh";

type Section = "matches" | "inbox" | "me";

type Props = {
  eventName: string;
  current?: Section;
  /** Incoming requests + unread messages, shown on the Inbox tab. */
  inboxCount?: number;
  /** When set, the page re-renders on this user's realtime events (badge, request state). */
  userId?: string;
  /** Realtime events that trigger a refresh; the chat page handles `message` itself. */
  liveEvents?: string[];
  children: ReactNode;
};

/** Chrome for attendee pages on an event subdomain. Links are relative to the event host. */
export function AttendeeShell({ eventName, current, inboxCount = 0, userId, liveEvents, children }: Props) {
  const tabs: { id: Section; href: string; label: string }[] = [
    { id: "matches", href: "/home", label: "Matches" },
    { id: "inbox", href: "/inbox", label: "Inbox" },
    { id: "me", href: "/me", label: "Profile" },
  ];
  return (
    <div className="min-h-dvh bg-canvas">
      {userId && <LiveRefresh topic={`user:${userId}`} events={liveEvents ?? ["request", "conversation", "message"]} />}
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="truncate font-semibold text-fg">{eventName}</Link>
          {current ? (
            <nav aria-label="Attendee" className="flex shrink-0 gap-1 text-sm">
              {tabs.map((t) => (
                <Link key={t.id} href={t.href} aria-current={current === t.id ? "page" : undefined}
                      className={`relative rounded-lg px-2.5 py-1.5 font-medium sm:px-3 ${
                        current === t.id ? "bg-primary-soft text-primary-soft-fg" : "text-muted hover:text-fg"}`}>
                  {t.label}
                  {t.id === "inbox" && inboxCount > 0 && (
                    <span className="ml-1.5 inline-flex min-w-5 justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-fg">
                      {inboxCount > 99 ? "99+" : inboxCount}
                      <span className="sr-only"> new</span>
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          ) : (
            <span className="shrink-0 text-xs text-muted">IntroHall</span>
          )}
        </div>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  );
}
