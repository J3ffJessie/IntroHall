import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
        <nav aria-label="Main" className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-fg">
            <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-fg">
              I
            </span>
            IntroHall
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-muted hover:text-fg">Dashboard</Link>
            <Link href="/profile" className="text-muted hover:text-fg">Profile</Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-muted hover:text-fg">Sign out</button>
            </form>
          </div>
        </nav>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-8">{children}</div>
    </div>
  );
}
