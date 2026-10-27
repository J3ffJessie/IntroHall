"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { reportAttendee } from "@/app/e/[slug]/actions";
import { Button, inputClass } from "@/components/ui";

type Props = {
  slug: string;
  attendeeId: string;
  name: string;
  /** Reporting a specific message attaches a copy of it as evidence. */
  messageId?: string;
  messagePreview?: string;
  label: string;
  className?: string;
};

export function ReportDialog({ slug, attendeeId, name, messageId, messagePreview, label, className }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  // Mounted only while open: a chat can have one Report link per message.
  useEffect(() => {
    const d = dialog.current;
    if (!open || !d) return;
    d.showModal();
    const onClose = () => setOpen(false);
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, [open]);

  const submit = () => start(async () => {
    const err = await reportAttendee(slug, attendeeId, reason.trim(), messageId);
    if (err) return setError(err);
    setDone(true);
  });

  return (
    <>
      <button type="button" className={className ?? "text-sm text-muted underline hover:text-fg"}
              onClick={() => { setDone(false); setError(null); setReason(""); setOpen(true); }}>
        {label}
      </button>
      {open && <dialog ref={dialog} aria-labelledby={`report-title-${attendeeId}${messageId ?? ""}`}
              className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-fg shadow-xl backdrop:bg-black/50">
        <div className="flex flex-col gap-4 p-5">
          <h2 id={`report-title-${attendeeId}${messageId ?? ""}`} className="text-lg font-semibold">Report {name}</h2>
          {done ? (
            <>
              <p role="status">Thanks. The organizers have been notified and will review it.</p>
              <Button onClick={() => dialog.current?.close()}>Close</Button>
            </>
          ) : (
            <>
              {messagePreview && (
                <blockquote className="rounded-lg bg-surface-muted px-3 py-2 text-sm">“{messagePreview}”</blockquote>
              )}
              <p className="text-sm text-muted">
                Only the organizers see reports. {messagePreview ? "A copy of this message is kept as evidence." : ""}
              </p>
              <label htmlFor={`reason-${attendeeId}${messageId ?? ""}`} className="text-sm font-medium">What happened?</label>
              <textarea id={`reason-${attendeeId}${messageId ?? ""}`} value={reason} onChange={(e) => setReason(e.target.value)}
                        rows={3} maxLength={1000} className={inputClass} />
              {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => dialog.current?.close()}>Cancel</Button>
                <Button variant="danger" disabled={pending || !reason.trim()} onClick={submit}>Send report</Button>
              </div>
            </>
          )}
        </div>
      </dialog>}
    </>
  );
}
