import Link from "next/link";
import type { ReactNode } from "react";

/** Chrome for attendee pages on an event subdomain. Links are relative to the event host. */
export function AttendeeShell({ eventName, children }: { eventName: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
        <nav aria-label="Event" className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="truncate font-semibold text-fg">{eventName}</Link>
          <span className="shrink-0 text-xs text-muted">IntroHall</span>
        </nav>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  );
}
