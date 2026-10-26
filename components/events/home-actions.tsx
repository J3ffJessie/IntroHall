"use client";

import { useTransition } from "react";
import { leaveEvent, setProfileVisibility } from "@/app/e/[slug]/actions";
import { Button, Card } from "@/components/ui";

export function HomeActions({ slug, hidden, eventName }: { slug: string; hidden: boolean; eventName: string }) {
  const [pending, start] = useTransition();
  return (
    <Card title="Privacy">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          {hidden ? "Hidden: you don't appear in matches." : "Visible: attendees who share your interests can find you."}
        </p>
        <Button variant="secondary" disabled={pending}
                onClick={() => start(() => setProfileVisibility(slug, hidden ? "visible" : "hidden"))}>
          {hidden ? "Show my profile" : "Hide my profile"}
        </Button>
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">Leaving removes you from {eventName}. You can rejoin later.</p>
        <Button variant="danger" disabled={pending}
                onClick={() => confirm(`Leave ${eventName}?`) && start(() => leaveEvent(slug))}>
          Leave event
        </Button>
      </div>
    </Card>
  );
}
