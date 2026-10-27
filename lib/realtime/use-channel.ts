"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";

export type BroadcastHandler = (event: string, payload: Record<string, unknown>) => void;

/**
 * Subscribes to a private Realtime broadcast topic (R7: `user:{uid}`, `event:{id}`,
 * `moderation:{id}`). Authorization is the realtime.messages RLS policy; clients never send.
 */
export function useChannel(topic: string | null, onEvent: BroadcastHandler) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!topic) return;
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(topic, { config: { private: true } })
        .on("broadcast", { event: "*" }, (msg) => handler.current(msg.event, (msg.payload ?? {}) as Record<string, unknown>))
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [topic]);
}
