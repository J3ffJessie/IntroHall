import Link from "next/link";
import type { ReactNode } from "react";
import { EventNav } from "@/components/events/event-nav";
import { getOrgEvent } from "@/lib/org-event";

export default async function EventLayout({ children, params }: { children: ReactNode; params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event } = await getOrgEvent(eventId);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/dashboard/orgs/${event.org_id}`} className="text-sm text-muted hover:text-fg">
          {event.organizations?.name}
        </Link>
        <h1 className="text-2xl font-semibold">{event.name}</h1>
      </div>
      <EventNav eventId={eventId} />
      {children}
    </div>
  );
}
