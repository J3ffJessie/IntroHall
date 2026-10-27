"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "", label: "Overview" },
  { href: "/details", label: "Details" },
  { href: "/branding", label: "Branding" },
  { href: "/tags", label: "Interests" },
  { href: "/attendees", label: "Attendees" },
  { href: "/reports", label: "Reports" },
  { href: "/access", label: "Access & QR" },
];

export function EventNav({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/events/${eventId}`;
  return (
    <nav aria-label="Event sections" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b border-border">
        {tabs.map((t) => {
          const href = base + t.href;
          const current = pathname === href;
          return (
            <li key={t.href}>
              <Link href={href} aria-current={current ? "page" : undefined}
                    className={`block whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                      current ? "border-primary text-fg font-medium" : "border-transparent text-muted"}`}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
