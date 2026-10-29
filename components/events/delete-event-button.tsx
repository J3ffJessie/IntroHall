"use client";

import { useState, useTransition } from "react";
import { deleteEvent } from "@/app/(organizer)/dashboard/events/[eventId]/actions";
import { Button } from "@/components/ui";

export function DeleteEventButton({ eventId, orgId, name }: { eventId: string; orgId: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="danger" className="w-fit" disabled={pending}
              onClick={() => confirm(`Delete “${name}”? Its page goes offline now. You can restore it from the organization page for 30 days.`) &&
                start(async () => setError(await deleteEvent(eventId, orgId)))}>
        Delete event
      </Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
