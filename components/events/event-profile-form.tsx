"use client";

import { useState } from "react";
import { Button, Card, Field, FormMessage, inputClass } from "@/components/ui";
import { MAX_INTERESTS } from "@/lib/event-profile";
import type { FormState } from "@/lib/form-state";
import { tagKey } from "@/lib/tags";
import { useFormAction } from "@/lib/use-form-action";
import { useHydrated } from "@/lib/use-hydrated";

type Tag = { id: string; label: string; selected: boolean };
type Props = {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial: { full_name: string; headline: string; company: string; bio: string; looking_for: string };
  tags: Tag[];
  allowCustom: boolean;
  maxCustom: number;
  submitLabel: string;
};

export function EventProfileForm({ action, initial, tags, allowCustom, maxCustom, submitLabel }: Props) {
  const [state, onSubmit, pending] = useFormAction(action);
  const hydrated = useHydrated();
  const [selected, setSelected] = useState(() => new Set(tags.filter((t) => t.selected).map((t) => t.id)));
  const [custom, setCustom] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const total = selected.size + custom.length;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (total >= MAX_INTERESTS) return setHint(`You can pick up to ${MAX_INTERESTS}.`);
    else next.add(id);
    setHint(null);
    setSelected(next);
  };

  const addCustom = () => {
    const label = draft.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!label) return;
    // Typing an existing interest just selects it.
    const existing = tags.find((t) => tagKey(t.label) === tagKey(label));
    if (existing) {
      if (!selected.has(existing.id)) toggle(existing.id);
      return setDraft("");
    }
    if (custom.some((c) => tagKey(c) === tagKey(label))) return setDraft("");
    if (total >= MAX_INTERESTS) return setHint(`You can pick up to ${MAX_INTERESTS}.`);
    if (custom.length >= maxCustom) return setHint(`You can add up to ${maxCustom} of your own.`);
    if (label.length > 40) return setHint("Interests are at most 40 characters.");
    setHint(null);
    setCustom([...custom, label]);
    setDraft("");
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card title="Interests">
        <p className="text-sm text-muted" aria-live="polite">{total} of {MAX_INTERESTS} selected</p>
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const on = selected.has(t.id);
            return (
              <li key={t.id}>
                <button type="button" aria-pressed={on} onClick={() => toggle(t.id)}
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                          on ? "border-primary bg-primary text-primary-fg"
                             : "border-border-strong bg-surface text-fg hover:border-primary"}`}>
                  {on && <span aria-hidden>✓ </span>}{t.label}
                </button>
              </li>
            );
          })}
          {custom.map((c) => (
            <li key={c}>
              <button type="button" aria-pressed onClick={() => setCustom(custom.filter((x) => x !== c))}
                      aria-label={`Remove ${c}`}
                      className="rounded-full border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg">
                ✓ {c} <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
        {[...selected].map((id) => <input key={id} type="hidden" name="tag_id" value={id} />)}
        {custom.map((c) => <input key={c} type="hidden" name="custom" value={c} />)}
        {allowCustom && maxCustom > 0 && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="custom-interest" className="text-sm font-medium">Add your own</label>
            <div className="flex gap-2">
              <input id="custom-interest" value={draft} maxLength={40} className={inputClass}
                     onChange={(e) => setDraft(e.target.value)}
                     onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
              <Button type="button" variant="secondary" onClick={addCustom}>Add</Button>
            </div>
          </div>
        )}
        {hint && <p className="text-sm text-warning-fg">{hint}</p>}
      </Card>

      <Card title="About you">
        <Field id="full_name" label="Name">
          <input id="full_name" name="full_name" required maxLength={100} defaultValue={initial.full_name} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="headline" label="Role or headline">
            <input id="headline" name="headline" maxLength={140} defaultValue={initial.headline} className={inputClass} />
          </Field>
          <Field id="company" label="Company">
            <input id="company" name="company" maxLength={100} defaultValue={initial.company} className={inputClass} />
          </Field>
        </div>
        <Field id="bio" label="Short bio" hint="Only attendees of this event see it.">
          <textarea id="bio" name="bio" rows={3} maxLength={500} defaultValue={initial.bio} className={inputClass} />
        </Field>
        <Field id="looking_for" label="I'm looking for" hint="e.g. co-founders, Rust contributors, design feedback">
          <input id="looking_for" name="looking_for" maxLength={280} defaultValue={initial.looking_for} className={inputClass} />
        </Field>
      </Card>

      <Button type="submit" disabled={pending || total === 0 || !hydrated} className="w-full">{pending ? "Saving…" : submitLabel}</Button>
      <FormMessage state={state} />
    </form>
  );
}
