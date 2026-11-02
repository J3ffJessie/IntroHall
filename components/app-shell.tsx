import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
        <nav aria-label="Main" className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
            <BrandMark />
            IntroHall
          </Link>
          <div className="hidden items-center gap-1 text-sm sm:flex">
            <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-surface-muted hover:text-fg">Dashboard</Link>
            <Link href="/profile" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-surface-muted hover:text-fg">Profile</Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-surface-muted hover:text-fg">Sign out</button>
            </form>
          </div>
          <AccountMenu />
        </nav>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-8">{children}</div>
    </div>
  );
}
