"use client";

import { useTransition } from "react";
import { addTag, setTagHidden } from "@/app/(organizer)/dashboard/events/[eventId]/actions";
import { Button, FormMessage, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";

type Tag = { id: string; label: string; is_official: boolean; hidden: boolean };

export function TagManager({ eventId, tags, disabled }: { eventId: string; tags: Tag[]; disabled: boolean }) {
  const [state, onSubmit, pending] = useFormAction(addTag.bind(null, eventId), { resetOnSuccess: true });
  const [toggling, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      {!disabled && (
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <label htmlFor="tag-label" className="text-sm font-medium">Add an interest</label>
          <div className="flex gap-2">
            <input id="tag-label" name="label" required maxLength={40} className={inputClass} />
            <Button type="submit" disabled={pending}>Add</Button>
          </div>
          <FormMessage state={state} />
        </form>
      )}
      {tags.length === 0 ? (
        <p className="text-muted">No interests yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t.id}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                  t.hidden ? "border-dashed border-border-strong text-muted" : "border-border-strong"}`}>
              <span>{t.label}</span>
              {!t.is_official && <span className="text-xs text-muted">(attendee)</span>}
              {!disabled && (
                <button type="button" disabled={toggling} className="text-xs underline"
                        aria-label={`${t.hidden ? "Show" : "Hide"} ${t.label}`}
                        onClick={() => start(() => setTagHidden(eventId, t.id, !t.hidden))}>
                  {t.hidden ? "Show" : "Hide"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
