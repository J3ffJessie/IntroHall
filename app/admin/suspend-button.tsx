"use client";

import { useState, useTransition } from "react";
import { setOrgSuspended, setUserSuspended } from "./actions";
import { useConfirm } from "@/components/confirm";

export function SuspendButton({ kind, id, name, suspended }:
  { kind: "org" | "user"; id: string; name: string; suspended: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();
  const warning = kind === "org"
    ? "Its event pages go offline and its team loses access until you unsuspend it."
    : "They are signed out, can't sign in, and are removed and banned from every event they joined.";
  const run = async () => {
    if (!suspended && !await ask({ title: `Suspend ${name}?`, description: warning, action: "Suspend" })) return;
    start(async () => setError(await (kind === "org" ? setOrgSuspended : setUserSuspended)(id, !suspended)));
  };
  return (
    <span className="flex items-center gap-2">
      {dialog}
      {error && <span role="alert" className="text-sm text-danger">{error}</span>}
      <button type="button" disabled={pending} onClick={run} aria-label={`${suspended ? "Unsuspend" : "Suspend"} ${name}`}
              className={`text-sm underline ${suspended ? "" : "text-danger"}`}>
        {suspended ? "Unsuspend" : "Suspend"}
      </button>
    </span>
  );
}
