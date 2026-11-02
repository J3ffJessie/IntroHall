"use client";

import { Flag } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { reportAttendee } from "@/app/e/[slug]/actions";
import { Button, inputClass } from "@/components/ui";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const reasonId = `reason-${attendeeId}${messageId ?? ""}`;

  const submit = () => start(async () => {
    const err = await reportAttendee(slug, attendeeId, reason.trim(), messageId);
    if (err) return setError(err);
    setDone(true);
  });

  return (
    <Dialog onOpenChange={(open) => { if (open) { setDone(false); setError(null); setReason(""); } }}>
      <DialogTrigger className={className ?? "text-sm text-muted-foreground underline hover:text-fg"}>{label}</DialogTrigger>
      {/* The done state has its own Close button; a second one would be ambiguous. */}
      <DialogContent showClose={!done}>
        <DialogTitle className="flex items-center gap-2">
          <Flag weight="duotone" aria-hidden className="size-5 text-danger" />Report {name}
        </DialogTitle>
        {done ? (
          <>
            <p role="status">Thanks. The organizers have been notified and will review it.</p>
            <DialogClose asChild><Button>Close</Button></DialogClose>
          </>
        ) : (
          <>
            {messagePreview && (
              <blockquote className="rounded-xl border-l-4 border-primary/40 bg-surface-muted px-3 py-2 text-sm">“{messagePreview}”</blockquote>
            )}
            <DialogDescription>
              Only the organizers see reports. {messagePreview ? "A copy of this message is kept as evidence." : ""}
            </DialogDescription>
            <label htmlFor={reasonId} className="text-sm font-medium">What happened?</label>
            <textarea id={reasonId} value={reason} onChange={(e) => setReason(e.target.value)}
                      rows={3} maxLength={1000} className={inputClass} />
            {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
              <Button variant="danger" disabled={pending || !reason.trim()} onClick={submit}>Send report</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
