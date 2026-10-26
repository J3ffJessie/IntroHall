"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/browser";

type Outcome =
  | "joining" | "code_required" | "invalid_code" | "rate_limited" | "full" | "banned" | "not_found" | "closed" | "error";

const MESSAGES: Partial<Record<Outcome, string>> = {
  invalid_code: "That code didn't work. Check the code on your badge or the event signage.",
  rate_limited: "Too many attempts. Please wait 15 minutes and try again.",
  full: "This event is full.",
  banned: "You can't join this event.",
  not_found: "This event isn't open for joining.",
  closed: "This event has ended.",
  error: "Something went wrong. Please try again.",
};

/**
 * Calls join_event from the browser (not a server action) so the database rate-limits by the
 * attendee's own IP, not the app server's.
 */
export function JoinRunner({ slug, initialCode }: { slug: string; initialCode: string | null }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>("joining");
  const [code, setCode] = useState(initialCode ?? "");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const join = useCallback(async (joinCode: string | null) => {
    setBusy(true);
    const { data, error } = await createClient().rpc("join_event", { p_slug: slug, p_code: joinCode ?? undefined });
    setBusy(false);
    const status = (error ? "error" : data?.[0]?.status ?? "error") as Outcome | "joined" | "already_joined";
    if (status === "joined" || status === "already_joined") {
      router.replace("/setup");
      router.refresh();
      return;
    }
    setOutcome(status);
  }, [router, slug]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void join(initialCode);
  }, [join, initialCode]);

  if (outcome === "joining") return <p role="status" className="text-muted">Joining…</p>;

  const needsCode = outcome === "code_required" || outcome === "invalid_code";
  return (
    <div className="flex flex-col gap-4">
      {MESSAGES[outcome] && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{MESSAGES[outcome]}</p>
      )}
      {needsCode && (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void join(code.trim()); }}>
          <Field id="join-code" label="Event code" hint="Scan the event's QR code, or type the 10-character code.">
            <input id="join-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required
                   autoComplete="off" autoCapitalize="characters" maxLength={10}
                   className={`${inputClass} font-mono tracking-widest`} />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">Join</Button>
        </form>
      )}
      {outcome === "error" && <Button variant="secondary" onClick={() => void join(code || null)}>Try again</Button>}
    </div>
  );
}
