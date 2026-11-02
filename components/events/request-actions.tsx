"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { respondToRequest, withdrawConnectionRequest } from "@/app/e/[slug]/actions";
import { Check, X } from "@phosphor-icons/react";
import { celebrate, originOf } from "@/components/magicui/confetti";
import { Button } from "@/components/ui";
import { ReportDialog } from "./report-dialog";

export function RequestActions({ slug, requestId, attendeeId, name }:
  { slug: string; requestId: string; attendeeId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const respond = (accept: boolean, el?: Element) => start(async () => {
    const res = await respondToRequest(slug, requestId, accept);
    if (res.error) return setError(res.error);
    if (accept) celebrate(el && originOf(el));
    if (res.conversationId) router.push(`/chat/${res.conversationId}`);
    else router.refresh();
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={pending} onClick={(e) => respond(true, e.currentTarget)}><Check weight="bold" />Accept</Button>
      <Button variant="secondary" disabled={pending} onClick={() => respond(false)}><X weight="bold" />Decline</Button>
      <ReportDialog slug={slug} attendeeId={attendeeId} name={name} label="Report" />
      {error && <p role="alert" className="w-full text-sm text-danger">{error}</p>}
    </div>
  );
}

export function WithdrawButton({ slug, requestId }: { slug: string; requestId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className="shrink-0 text-sm text-muted-foreground underline hover:text-fg"
            onClick={() => start(async () => { await withdrawConnectionRequest(slug, requestId); router.refresh(); })}>
      Withdraw
    </button>
  );
}
