"use client";

import { useState, useTransition } from "react";
import { setEventStatus } from "@/app/(organizer)/dashboard/events/[eventId]/actions";
import { Button } from "@/components/ui";
import { useConfirm } from "@/components/confirm";

export function StatusControls({ eventId, status, canArchive }: { eventId: string; status: string; canArchive: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();
  const run = async (action: "publish" | "unpublish" | "archive", confirm?: { title: string; description: string }) => {
    if (confirm && !await ask({ ...confirm, action: action === "publish" ? "Publish" : "Archive",
                                tone: action === "publish" ? "primary" : "danger" })) return;
    start(async () => setError(await setEventStatus(eventId, action)));
  };

  return (
    <div className="flex flex-col gap-2">
      {dialog}
      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <Button disabled={pending}
                  onClick={() => run("publish", { title: "Publish this event?", description: "Attendees can join right away. Its address can't change afterwards." })}>
            Publish
          </Button>
        )}
        {status === "published" && (
          <Button variant="secondary" disabled={pending} onClick={() => run("unpublish")}>Unpublish</Button>
        )}
        {status !== "archived" && canArchive && (
          <Button variant="danger" disabled={pending}
                  onClick={() => run("archive", { title: "Archive this event?", description: "It becomes read-only and can't be reopened." })}>
            Archive
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
