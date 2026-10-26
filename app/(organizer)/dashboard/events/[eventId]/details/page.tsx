import type { Metadata } from "next";
import { EventForm } from "@/components/events/event-form";
import { ROOT_DOMAIN } from "@/lib/env";
import { getOrgEvent } from "@/lib/org-event";
import { utcToZonedLocal } from "@/lib/time";
import { updateEvent } from "../actions";

export const metadata: Metadata = { title: "Event details" };

export default async function EventDetailsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event } = await getOrgEvent(eventId);
  if (event.status === "archived") return <p className="text-muted">Archived events are read-only.</p>;

  return (
    <main className="max-w-xl">
      <EventForm
        action={updateEvent.bind(null, eventId)}
        rootDomain={ROOT_DOMAIN}
        submitLabel="Save"
        slugLocked={event.published_at !== null}
        timeZones={Intl.supportedValuesOf("timeZone")}
        defaults={{
          name: event.name,
          slug: event.slug,
          description: event.description,
          venue: event.venue,
          timezone: event.timezone,
          starts_local: utcToZonedLocal(event.starts_at, event.timezone),
          ends_local: utcToZonedLocal(event.ends_at, event.timezone),
          retention_days: event.retention_days,
          allow_custom_interests: event.allow_custom_interests,
          max_custom_interests: event.max_custom_interests,
        }}
      />
    </main>
  );
}
