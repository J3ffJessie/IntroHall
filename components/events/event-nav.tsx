"use client";

import {
  CaretDown, ChartBar, Flag, Megaphone, NotePencil, PaintBrush, QrCode, SquaresFour, Tag, UsersThree, type Icon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; icon: Icon };

const groups: { label: string; tabs: Tab[] }[] = [
  { label: "Run", tabs: [
    { href: "", label: "Overview", icon: SquaresFour },
    { href: "/analytics", label: "Analytics", icon: ChartBar },
    { href: "/announcements", label: "Announcements", icon: Megaphone },
  ] },
  { label: "Set up", tabs: [
    { href: "/details", label: "Details", icon: NotePencil },
    { href: "/branding", label: "Branding", icon: PaintBrush },
    { href: "/tags", label: "Interests", icon: Tag },
    { href: "/access", label: "Access & QR", icon: QrCode },
  ] },
  { label: "People", tabs: [
    { href: "/attendees", label: "Attendees", icon: UsersThree },
    { href: "/reports", label: "Reports", icon: Flag },
  ] },
];

const tabs = groups.flatMap((g) => g.tabs);

/** Section menu on narrow screens (nine tabs don't fit), a tab row from `lg` up. */
export function EventNav({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/events/${eventId}`;
  const current = tabs.find((t) => pathname === base + t.href) ?? tabs[0];
  const CurrentIcon = current.icon;

  return (
    <nav aria-label="Event sections">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-2 pr-4 text-left shadow-sm hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary lg:hidden">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-fg">
            <CurrentIcon weight="duotone" className="size-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs text-muted-foreground">Section</span>
            <span className="truncate font-medium">{current.label}</span>
          </span>
          <span className="text-xs text-muted-foreground">All {tabs.length}</span>
          <CaretDown aria-hidden weight="bold" className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) lg:hidden">
          {groups.map((g, i) => (
            <DropdownMenuGroup key={g.label}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
              {g.tabs.map((t) => {
                const active = t === current;
                return (
                  <DropdownMenuItem key={t.href} asChild>
                    <Link href={base + t.href} aria-current={active ? "page" : undefined}
                          className={cn("py-2.5 text-base", active && "bg-primary-soft font-medium text-primary-soft-fg")}>
                      <t.icon weight={active ? "fill" : "duotone"} />{t.label}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ul className="hidden border-b border-border lg:flex">
        {tabs.map((t) => {
          const active = t === current;
          return (
            <li key={t.href}>
              <Link href={base + t.href} aria-current={active ? "page" : undefined}
                    className={cn("block border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                      active ? "border-primary font-medium text-fg" : "border-transparent text-muted-foreground hover:text-fg")}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
