"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { disablePush, enablePush, getPushState, type PushState, refreshPushLink } from "@/lib/push-client";

const DISMISS_KEY = "introhall-push-prompt-dismissed";

function IosInstructions() {
  return (
    <ol className="ml-5 list-decimal text-sm text-muted">
      <li>Tap the <strong>Share</strong> button in Safari.</li>
      <li>Choose <strong>Add to Home Screen</strong>.</li>
      <li>Open the event from your Home Screen and turn on notifications there.</li>
    </ol>
  );
}

function usePush(eventId: string) {
  const [state, setState] = useState<PushState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getPushState().then(setState);
    void refreshPushLink(eventId);
  }, [eventId]);
  const run = async (fn: () => Promise<PushState>) => {
    setBusy(true);
    setError(null);
    try { setState(await fn()); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy(false);
  };
  return { state, error, busy, enable: () => run(() => enablePush(eventId)), disable: () => run(disablePush) };
}

/** Full control, on the profile page. */
export function PushSettings({ eventId }: { eventId: string }) {
  const { state, error, busy, enable, disable } = usePush(eventId);
  if (state === null) return null;
  return (
    <Card title="Notifications">
      {state === "on" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">On for this device: new requests, accepted requests, messages and announcements.</p>
          <Button variant="secondary" disabled={busy} onClick={disable}>Turn off</Button>
        </div>
      )}
      {state === "off" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">Get a notification when someone wants to meet or messages you.</p>
          <Button disabled={busy} onClick={enable}>Turn on</Button>
        </div>
      )}
      {state === "denied" && (
        <p className="text-sm text-muted">Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then come back.</p>
      )}
      {state === "ios-install" && (
        <>
          <p className="text-sm text-muted">On iPhone and iPad, notifications work once the event is on your Home Screen:</p>
          <IosInstructions />
        </>
      )}
      {state === "unsupported" && (
        <p className="text-sm text-muted">This browser doesn&apos;t support notifications. Your inbox still updates while the app is open.</p>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </Card>
  );
}

/** One-time, dismissible nudge on the matches page. */
export function PushPrompt({ eventId }: { eventId: string }) {
  const { state, busy, enable } = usePush(eventId);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { setDismissed(false); }
  }, []);
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
  };
  if (dismissed || (state !== "off" && state !== "ios-install")) return null;
  return (
    <aside aria-label="Notifications" className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary-soft/50 p-4">
      <p className="font-medium text-fg">Don&apos;t miss a connection</p>
      {state === "off" ? (
        <p className="text-sm text-muted">Turn on notifications to hear about new requests and messages, even when the app is closed.</p>
      ) : (
        <IosInstructions />
      )}
      <div className="flex gap-2">
        {state === "off" && <Button disabled={busy} onClick={enable}>Turn on notifications</Button>}
        <Button variant="secondary" onClick={dismiss}>Not now</Button>
      </div>
    </aside>
  );
}
