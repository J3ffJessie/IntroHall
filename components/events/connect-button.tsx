"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { respondToRequest, sendConnectionRequest } from "@/app/e/[slug]/actions";
import { Button, buttonClass, inputClass } from "@/components/ui";

export type Connection =
  | { state: "none" }
  | { state: "outgoing" }
  | { state: "incoming"; requestId: string }
  | { state: "connected"; conversationId: string | null };

export function ConnectButton({ slug, attendeeId, name, connection }:
  { slug: string; attendeeId: string; name: string; connection: Connection }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = name.split(" ")[0] || "them";

  const send = () => start(async () => {
    const err = await sendConnectionRequest(slug, attendeeId, note.trim());
    if (err) return setError(err);
    setOpen(false);
    router.refresh();
  });
  const respond = (accept: boolean) => start(async () => {
    if (connection.state !== "incoming") return;
    const res = await respondToRequest(slug, connection.requestId, accept);
    if (res.error) return setError(res.error);
    if (res.conversationId) router.push(`/chat/${res.conversationId}`);
    else router.refresh();
  });

  return (
    <div className="flex flex-col gap-2">
      {connection.state === "connected" ? (
        connection.conversationId
          ? <Link href={`/chat/${connection.conversationId}`} className={`${buttonClass.primary} w-full sm:w-fit`}>Message {first}</Link>
          : <p className="text-sm text-muted">Connected</p>
      ) : connection.state === "outgoing" ? (
        <p className="text-sm text-muted">Request sent · waiting for {first}</p>
      ) : connection.state === "incoming" ? (
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => respond(true)}>Accept</Button>
          <Button variant="secondary" disabled={pending} onClick={() => respond(false)}>Decline</Button>
        </div>
      ) : open ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`note-${attendeeId}`} className="text-sm font-medium">Add a note (optional)</label>
          <textarea id={`note-${attendeeId}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} rows={2}
                    placeholder={`Hi ${first}, …`} className={inputClass} />
          <div className="flex gap-2">
            <Button disabled={pending} onClick={send}>Send request</Button>
            <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" className="w-full sm:w-fit" onClick={() => { setOpen(true); setError(null); }}>
          Connect with {first}
        </Button>
      )}
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
