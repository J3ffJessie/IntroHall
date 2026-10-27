"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useChannel } from "@/lib/realtime/use-channel";

/**
 * Re-renders the current server page when one of `events` arrives on `topic`, when the tab
 * regains focus (unread counts are not broadcast, §4.5), and every `pollMs` as a fallback.
 */
export function LiveRefresh({ topic, events, pollMs }: { topic: string; events: string[]; pollMs?: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 150);
  };

  useChannel(topic, (event) => { if (events.includes(event)) refresh(); });

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const poll = pollMs ? setInterval(refresh, pollMs) : null;
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (poll) clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is stable enough; re-subscribing is not needed
  }, [pollMs]);

  return null;
}
