"use client";

import { useState, useTransition } from "react";
import { moderateAttendee } from "@/app/(organizer)/dashboard/events/[eventId]/actions";
import { useConfirm } from "@/components/confirm";
import { toast } from "sonner";

type Props = { eventId: string; attendeeId: string; name: string; banned: boolean; left: boolean };

export function RosterActions({ eventId, attendeeId, name, banned, left }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();
  const labels = { remove: "Remove", ban: "Ban", unban: "Unban" } as const;
  const done = { remove: `${name} was removed`, ban: `${name} was banned`, unban: `${name} can rejoin` } as const;
  const run = async (action: "remove" | "ban" | "unban", title: string, description: string) => {
    if (!await ask({ title, description, action: labels[action], tone: action === "unban" ? "primary" : "danger" })) return;
    start(async () => {
      const err = await moderateAttendee(eventId, attendeeId, action);
      setError(err);
      if (!err) toast.success(done[action]);
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-3 text-sm">
      {dialog}
      {error && <span role="alert" className="text-danger">{error}</span>}
      {banned ? (
        <button type="button" disabled={pending} className="text-primary underline"
                onClick={() => run("unban", `Allow ${name} to rejoin?`, "They'll be able to join with the event link again.")}>Unban</button>
      ) : (
        <>
          {!left && (
            <button type="button" disabled={pending} className="text-muted-foreground underline hover:text-fg"
                    onClick={() => run("remove", `Remove ${name}?`, "They can rejoin.")}>Remove</button>
          )}
          <button type="button" disabled={pending} className="text-danger underline"
                  onClick={() => run("ban", `Remove and ban ${name}?`, "They won't be able to rejoin.")}>Ban</button>
        </>
      )}
    </div>
  );
}
