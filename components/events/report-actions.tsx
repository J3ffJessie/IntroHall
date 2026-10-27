"use client";

import { useState, useTransition } from "react";
import { moderateAttendee, resolveReport } from "@/app/(organizer)/dashboard/events/[eventId]/actions";
import { Button, inputClass } from "@/components/ui";

type Props = { eventId: string; reportId: string; attendeeId: string | null; name: string; banned: boolean; left: boolean };

export function ReportActions({ eventId, reportId, attendeeId, name, banned, left }: Props) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const moderate = (action: "remove" | "ban", text: string) => attendeeId && confirm(text) &&
    start(async () => setError(await moderateAttendee(eventId, attendeeId, action)));

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`note-${reportId}`} className="sr-only">Resolution note</label>
      <input id={`note-${reportId}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000}
             placeholder="Note (optional), e.g. “Warned by email”" className={inputClass} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => start(async () => setError(await resolveReport(eventId, reportId, note)))}>
          Resolve
        </Button>
        {attendeeId && !left && (
          <Button variant="secondary" disabled={pending}
                  onClick={() => moderate("remove", `Remove ${name} from the event? They can rejoin.`)}>Remove</Button>
        )}
        {attendeeId && !banned && (
          <Button variant="danger" disabled={pending}
                  onClick={() => moderate("ban", `Remove and ban ${name}? They won't be able to rejoin.`)}>Ban</Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
