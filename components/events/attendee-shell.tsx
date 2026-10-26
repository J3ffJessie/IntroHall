import Link from "next/link";
import type { ReactNode } from "react";

type Section = "matches" | "me";

/** Chrome for attendee pages on an event subdomain. Links are relative to the event host. */
export function AttendeeShell({ eventName, current, children }:
  { eventName: string; current?: Section; children: ReactNode }) {
  const tabs: { id: Section; href: string; label: string }[] = [
    { id: "matches", href: "/home", label: "Matches" },
    { id: "me", href: "/me", label: "My profile" },
  ];
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="truncate font-semibold text-fg">{eventName}</Link>
          {current ? (
            <nav aria-label="Attendee" className="flex shrink-0 gap-1 text-sm">
              {tabs.map((t) => (
                <Link key={t.id} href={t.href} aria-current={current === t.id ? "page" : undefined}
                      className={`rounded-lg px-3 py-1.5 font-medium ${
                        current === t.id ? "bg-primary-soft text-primary-soft-fg" : "text-muted hover:text-fg"}`}>
                  {t.label}
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
