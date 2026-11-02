import { ChatsCircle, Sparkle, UserCircle } from "@phosphor-icons/react/dist/ssr";
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
  const tabs: { id: Section; href: string; label: string; icon: ReactNode }[] = [
    { id: "matches", href: "/home", label: "Matches", icon: <Sparkle weight="duotone" /> },
    { id: "inbox", href: "/inbox", label: "Inbox", icon: <ChatsCircle weight="duotone" /> },
    { id: "me", href: "/me", label: "Profile", icon: <UserCircle weight="duotone" /> },
  ];
  return (
    <div className="min-h-dvh">
      {userId && <LiveRefresh topic={`user:${userId}`} events={liveEvents ?? ["request", "conversation", "message"]} />}
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="truncate font-display text-lg font-semibold text-fg">{eventName}</Link>
          {current ? (
            <nav aria-label="Attendee" className="flex shrink-0 gap-1 text-sm">
              {tabs.map((t) => (
                <Link key={t.id} href={t.href} aria-current={current === t.id ? "page" : undefined}
                      className={`relative inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-medium transition-colors sm:px-3 [&>svg]:size-4.5 [&>svg]:shrink-0 ${
                        current === t.id ? "bg-primary-soft text-primary-soft-fg" : "text-muted-foreground hover:text-fg"}`}>
                  {t.icon}
                  <span className={current === t.id ? "" : "max-sm:sr-only"}>{t.label}</span>
                  {t.id === "inbox" && inboxCount > 0 && (
                    <span className="inline-flex min-w-5 justify-center rounded-full bg-highlight-soft px-1.5 text-xs font-semibold text-highlight-soft-fg ring-1 ring-highlight/40">
                      {inboxCount > 99 ? "99+" : inboxCount}
                      <span className="sr-only"> new</span>
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          ) : (
            <span className="shrink-0 font-display text-xs font-semibold text-muted-foreground">IntroHall</span>
          )}
        </div>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  );
}
