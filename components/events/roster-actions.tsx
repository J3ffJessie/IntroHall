"use client";

import { useState, useTransition } from "react";
import { moderateAttendee } from "@/app/(organizer)/dashboard/events/[eventId]/actions";

type Props = { eventId: string; attendeeId: string; name: string; banned: boolean; left: boolean };

export function RosterActions({ eventId, attendeeId, name, banned, left }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: "remove" | "ban" | "unban", text: string) =>
    confirm(text) && start(async () => setError(await moderateAttendee(eventId, attendeeId, action)));

  return (
    <div className="flex shrink-0 items-center gap-3 text-sm">
      {error && <span role="alert" className="text-danger">{error}</span>}
      {banned ? (
        <button type="button" disabled={pending} className="text-primary underline"
                onClick={() => run("unban", `Allow ${name} to rejoin?`)}>Unban</button>
      ) : (
        <>
          {!left && (
            <button type="button" disabled={pending} className="text-muted underline hover:text-fg"
                    onClick={() => run("remove", `Remove ${name}? They can rejoin.`)}>Remove</button>
          )}
          <button type="button" disabled={pending} className="text-danger underline"
                  onClick={() => run("ban", `Remove and ban ${name}? They won't be able to rejoin.`)}>Ban</button>
        </>
      )}
    </div>
  );
}
