"use client";

import { useState, useTransition } from "react";
import {
  createAnnouncement, deleteAnnouncement, publishAnnouncementNow, setAnnouncementPinned,
} from "@/app/(organizer)/dashboard/events/[eventId]/actions";
import { Button, Field, FormMessage, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";

export function AnnouncementComposer({ eventId, timeZone, disabled }: { eventId: string; timeZone: string; disabled: boolean }) {
  const [state, onSubmit, pending] = useFormAction(createAnnouncement.bind(null, eventId, timeZone), { resetOnSuccess: true });
  const [when, setWhen] = useState<"now" | "schedule">("now");

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <fieldset disabled={disabled} className="flex flex-col gap-4">
        <Field id="ann-title" label="Title">
          <input id="ann-title" name="title" required maxLength={120} className={inputClass} placeholder="Keynote starts in 10 minutes" />
        </Field>
        <Field id="ann-body" label="Message (optional)">
          <textarea id="ann-body" name="body" rows={3} maxLength={2000} className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="pinned" /> Pin to the top of the feed
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">When</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} /> Post now
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="when" value="schedule" checked={when === "schedule"} onChange={() => setWhen("schedule")} /> Schedule
          </label>
          {when === "schedule" && (
            <Field id="ann-at" label="Post at" hint={`In the event's time zone (${timeZone}).`}>
              <input id="ann-at" name="publish_local" type="datetime-local" required className={`${inputClass} w-fit`} />
            </Field>
          )}
        </fieldset>
        <Button type="submit" disabled={pending} className="w-fit">{when === "now" ? "Post announcement" : "Schedule"}</Button>
      </fieldset>
      <FormMessage state={state} />
    </form>
  );
}

export function AnnouncementRowActions({ eventId, id, pinned, scheduled = false }:
  { eventId: string; id: string; pinned: boolean; scheduled?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {scheduled && (
        <button type="button" disabled={pending} className="text-primary underline"
                onClick={() => start(async () => setError(await publishAnnouncementNow(eventId, id)))}>Post now</button>
      )}
      <button type="button" disabled={pending} className="text-muted underline hover:text-fg"
              onClick={() => start(() => setAnnouncementPinned(eventId, id, !pinned))}>{pinned ? "Unpin" : "Pin"}</button>
      <button type="button" disabled={pending} className="text-danger underline"
              onClick={() => confirm("Delete this announcement?") && start(() => deleteAnnouncement(eventId, id))}>Delete</button>
      {error && <span role="alert" className="text-danger">{error}</span>}
    </div>
  );
}
