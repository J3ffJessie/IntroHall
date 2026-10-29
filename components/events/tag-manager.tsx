"use client";

import { useTransition } from "react";
import { addTag, mergeTags, setTagHidden } from "@/app/(organizer)/dashboard/events/[eventId]/actions";
import { Button, FormMessage, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";

type Tag = { id: string; label: string; is_official: boolean; hidden: boolean };

export function TagManager({ eventId, tags, disabled, merged }:
  { eventId: string; tags: Tag[]; disabled: boolean; merged: { label: string; into: string }[] }) {
  const [state, onSubmit, pending] = useFormAction(addTag.bind(null, eventId), { resetOnSuccess: true });
  const [mergeState, onMerge, merging] = useFormAction(mergeTags.bind(null, eventId), { resetOnSuccess: true });
  const visible = tags.filter((t) => !t.hidden);
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
      {!disabled && tags.length >= 2 && (
        <form onSubmit={onMerge} className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-medium">Merge duplicates</h3>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1 text-sm">
              <label htmlFor="merge-from">Merge</label>
              <select id="merge-from" name="from" required defaultValue="" className={`${inputClass} w-auto`}>
                <option value="" disabled>Choose…</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <label htmlFor="merge-into">into</label>
              <select id="merge-into" name="into" required defaultValue="" className={`${inputClass} w-auto`}>
                <option value="" disabled>Choose…</option>
                {visible.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <Button type="submit" variant="secondary" disabled={merging}>Merge</Button>
          </div>
          <p className="text-xs text-muted">This can&apos;t be undone. The first interest disappears; anyone who typed it later gets the second.</p>
          <FormMessage state={mergeState} />
        </form>
      )}
      {merged.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <h3 className="font-medium">Merged</h3>
          <ul className="text-muted">
            {merged.map((m) => <li key={m.label}>{m.label} → {m.into}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
