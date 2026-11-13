"use client";

import { LockSimple, NotePencil } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveConnectionNote } from "@/app/e/[slug]/actions";
import { Button, inputClass } from "@/components/ui";

const MAX = 2000;

/** The viewer's private note about a connection (who they are, what you talked about, what to follow up on). */
export function ConnectionNote({ slug, attendeeId, name, initial }:
  { slug: string; attendeeId: string; name: string; initial: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = name.split(" ")[0] || "them";

  const save = () => start(async () => {
    const body = draft.trim();
    const err = await saveConnectionNote(slug, attendeeId, body);
    if (err) return setError(err);
    setSaved(body);
    setDraft(body);
    setEditing(false);
    setError(null);
    router.refresh();
  });

  if (!editing) {
    return saved ? (
      <section aria-label={`Your note about ${first}`} className="rounded-xl bg-highlight-soft/60 px-3 py-2 text-sm">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <LockSimple aria-hidden className="size-3.5" />Private note · only you can see this
          </span>
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary underline">Edit note</button>
        </div>
        <p className="whitespace-pre-line text-fg">{saved}</p>
      </section>
    ) : (
      <button type="button" onClick={() => setEditing(true)}
              className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline hover:text-fg">
        <NotePencil aria-hidden className="size-4" />Add a private note
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <label htmlFor={`note-${attendeeId}`} className="text-sm font-medium">Private note about {first}</label>
      <textarea id={`note-${attendeeId}`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={MAX} rows={3}
                autoFocus placeholder="What did you talk about? Anything to follow up on?" className={inputClass} />
      <p className="text-xs text-muted-foreground">
        Only you can see this, and you can come back to it after the event. Clear it to delete.
      </p>
      <div className="flex gap-2">
        <Button disabled={pending || draft.trim() === saved} onClick={save}>Save note</Button>
        <Button variant="secondary" disabled={pending} onClick={() => { setDraft(saved); setEditing(false); setError(null); }}>Cancel</Button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
