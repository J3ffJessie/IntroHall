"use client";

import { useState } from "react";
import { Button, Field, FormMessage, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { slugify } from "@/lib/slugify";
import { useFormAction } from "@/lib/use-form-action";

export type EventFormDefaults = {
  name: string;
  slug: string;
  description: string;
  venue: string;
  timezone: string;
  starts_local: string;
  ends_local: string;
  retention_days: number;
  allow_custom_interests: boolean;
  max_custom_interests: number;
};

type Props = {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  defaults?: EventFormDefaults;
  slugLocked?: boolean;
  rootDomain: string;
  submitLabel: string;
  /** From the server, so SSR and hydration render the same list. */
  timeZones: string[];
};

export function EventForm({ action, defaults, slugLocked = false, rootDomain, submitLabel, timeZones }: Props) {
  const [state, onSubmit, pending] = useFormAction(action);
  const [slug, setSlug] = useState(defaults?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(defaults));
  const [allowCustom, setAllowCustom] = useState(defaults?.allow_custom_interests ?? true);
  const defaultTz = defaults?.timezone ?? "America/New_York";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field id="name" label="Event name">
        <input id="name" name="name" required maxLength={120} defaultValue={defaults?.name} className={inputClass}
               onChange={(e) => !slugEdited && setSlug(slugify(e.target.value))} />
      </Field>
      <Field id="slug" label="Event address"
             hint={slugLocked ? "Locked after publishing, because printed QR codes use it."
                              : `Attendees visit ${slug || "your-event"}.${rootDomain}`}>
        <input id="slug" name="slug" required value={slug} readOnly={slugLocked} aria-readonly={slugLocked}
               className={`${inputClass} ${slugLocked ? "bg-surface-muted" : ""}`}
               onChange={(e) => { setSlugEdited(true); setSlug(e.target.value.toLowerCase()); }} />
      </Field>
      <Field id="timezone" label="Time zone" hint="All event times are shown to attendees in this zone.">
        <select id="timezone" name="timezone" defaultValue={defaultTz} className={inputClass}>
          {timeZones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="starts_local" label="Starts">
          <input id="starts_local" name="starts_local" type="datetime-local" required
                 defaultValue={defaults?.starts_local} className={inputClass} />
        </Field>
        <Field id="ends_local" label="Ends">
          <input id="ends_local" name="ends_local" type="datetime-local" required
                 defaultValue={defaults?.ends_local} className={inputClass} />
        </Field>
      </div>
      <Field id="venue" label="Venue">
        <input id="venue" name="venue" maxLength={200} defaultValue={defaults?.venue} className={inputClass} />
      </Field>
      <Field id="description" label="Description">
        <textarea id="description" name="description" rows={4} maxLength={2000}
                  defaultValue={defaults?.description} className={inputClass} />
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Attendee settings</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allow_custom_interests" checked={allowCustom}
                 onChange={(e) => setAllowCustom(e.target.checked)} />
          Attendees can add their own interests
        </label>
        {allowCustom && (
          <Field id="max_custom_interests" label="Max custom interests per attendee">
            <input id="max_custom_interests" name="max_custom_interests" type="number" min={0} max={10}
                   defaultValue={defaults?.max_custom_interests ?? 3} className={`${inputClass} w-24`} />
          </Field>
        )}
        {!allowCustom && <input type="hidden" name="max_custom_interests" value={0} />}
        <Field id="retention_days" label="Delete messages this many days after the event"
               hint="7–90 days. Messages under an open report are kept until it is resolved.">
          <input id="retention_days" name="retention_days" type="number" min={7} max={90}
                 defaultValue={defaults?.retention_days ?? 30} className={`${inputClass} w-24`} />
        </Field>
      </fieldset>

      <Button type="submit" disabled={pending} className="w-fit">{pending ? "Saving…" : submitLabel}</Button>
      <FormMessage state={state} />
    </form>
  );
}
