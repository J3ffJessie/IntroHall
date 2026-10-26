"use client";

import { useState, useTransition } from "react";
import { setEventStatus } from "@/app/(organizer)/dashboard/events/[eventId]/actions";
import { Button } from "@/components/ui";

export function StatusControls({ eventId, status, canArchive }: { eventId: string; status: string; canArchive: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: "publish" | "unpublish" | "archive", confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    start(async () => setError(await setEventStatus(eventId, action)));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <Button disabled={pending}
                  onClick={() => run("publish", "Publish this event? Its address can't change afterwards.")}>
            Publish
          </Button>
        )}
        {status === "published" && (
          <Button variant="secondary" disabled={pending} onClick={() => run("unpublish")}>Unpublish</Button>
        )}
        {status !== "archived" && canArchive && (
          <Button variant="danger" disabled={pending}
                  onClick={() => run("archive", "Archive this event? It becomes read-only and can't be reopened.")}>
            Archive
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
