"use client";

import { useState, useTransition } from "react";
import { rotateJoinCode, setJoinMode } from "@/app/(organizer)/dashboard/events/[eventId]/actions";
import { Button } from "@/components/ui";
import { QrDownload } from "./qr-download";
import { joinUrl } from "@/lib/qr";

type Props = {
  eventId: string;
  slug: string;
  joinMode: "open" | "code";
  rootDomain: string;
  protocol: string;
  disabled: boolean;
};

export function AccessPanel({ eventId, slug, joinMode, rootDomain, protocol, disabled }: Props) {
  const [mode, setMode] = useState(joinMode);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const changeMode = (next: "open" | "code") =>
    start(async () => {
      const err = await setJoinMode(eventId, next);
      if (err) return setError(err);
      setError(null);
      setMode(next);
      setCode(null);
    });

  const rotate = () => {
    if (!confirm("Generate a new code? QR codes already printed with the old code will stop working.")) return;
    start(async () => {
      const res = await rotateJoinCode(eventId);
      if (res.error) return setError(res.error);
      setError(null);
      setCode(res.code ?? null);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2" disabled={disabled || pending}>
        <legend className="sr-only">Join mode</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="join_mode" checked={mode === "open"} onChange={() => changeMode("open")} className="mt-1" />
          <span><strong>Open</strong> — anyone with the event link can join.</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="join_mode" checked={mode === "code"} onChange={() => changeMode("code")} className="mt-1" />
          <span><strong>Code</strong> — the QR code carries a secret code; the plain link alone can&apos;t join.</span>
        </label>
      </fieldset>

      {mode === "open" && <QrDownload url={joinUrl(slug, rootDomain, protocol)} slug={slug} />}

      {mode === "code" && (
        <div className="flex flex-col gap-3">
          {code ? (
            <>
              <p className="rounded-md bg-warning-soft p-3 text-sm text-warning-fg">
                Join code <code className="font-mono font-bold">{code}</code>. Download the QR code now: for security
                we only store a hash, so this code can&apos;t be shown again. Generating a new one invalidates it.
              </p>
              <QrDownload url={joinUrl(slug, rootDomain, protocol, code)} slug={slug} />
            </>
          ) : (
            <p className="text-sm text-muted">
              Codes are shown once. Generate one to get the QR code; any previous code stops working.
            </p>
          )}
          {!disabled && (
            <Button variant="secondary" onClick={rotate} disabled={pending} className="w-fit">
              {code ? "Generate another code" : "Generate join code"}
            </Button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
