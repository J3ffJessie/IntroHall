"use client";

import { useState, useTransition } from "react";
import { setOrgSuspended, setUserSuspended } from "./actions";

export function SuspendButton({ kind, id, name, suspended }:
  { kind: "org" | "user"; id: string; name: string; suspended: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const warning = kind === "org"
    ? `Suspend ${name}? Its event pages go offline and its team loses access until you unsuspend it.`
    : `Suspend ${name}? They are signed out, can't sign in, and are removed and banned from every event they joined.`;
  const run = () => {
    if (!suspended && !confirm(warning)) return;
    start(async () => setError(await (kind === "org" ? setOrgSuspended : setUserSuspended)(id, !suspended)));
  };
  return (
    <span className="flex items-center gap-2">
      {error && <span role="alert" className="text-sm text-danger">{error}</span>}
      <button type="button" disabled={pending} onClick={run} aria-label={`${suspended ? "Unsuspend" : "Suspend"} ${name}`}
              className={`text-sm underline ${suspended ? "" : "text-danger"}`}>
        {suspended ? "Unsuspend" : "Suspend"}
      </button>
    </span>
  );
}
