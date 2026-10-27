"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { blockAttendee } from "@/app/e/[slug]/actions";
import { Button, inputClass } from "@/components/ui";
import { enqueue, flush, list, type OutboxItem, type SendResult } from "@/lib/outbox/outbox";
import { useChannel } from "@/lib/realtime/use-channel";
import { createClient } from "@/lib/supabase/browser";
import { uuidv4 } from "@/lib/uuid";
import { ReportDialog } from "./report-dialog";

type Message = { id: string; sender_attendee: string | null; client_msg_id: string; body: string; created_at: string };

type Props = {
  slug: string;
  conversationId: string;
  userId: string;
  me: string;
  partner: { id: string | null; name: string; headline: string };
  readOnlyReason: string | null;
  initialMessages: Message[];
  timeZone: string;
};

const READ_ONLY_TEXT: Record<string, string> = {
  blocked: "This conversation is closed because one of you blocked the other.",
  left: "This conversation is read-only because someone left the event.",
  event_closed: "This event has ended; the conversation is read-only.",
};
const HEARTBEAT_MS = 30_000;
const PAGE = 50;

function merge(list: Message[], incoming: Message[]): Message[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function ChatView({ slug, conversationId, userId, me, partner, readOnlyReason, initialMessages, timeZone }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState(initialMessages);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [draft, setDraft] = useState("");
  const [hasOlder, setHasOlder] = useState(initialMessages.length === PAGE);
  const [online, setOnline] = useState(true);
  const [blocking, startBlock] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const time = useMemo(() => new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }), [timeZone]);

  const refreshOutbox = useCallback(async () => setOutbox(await list(conversationId)), [conversationId]);

  // Marks the conversation read the moment the partner's messages are on a visible screen, so the
  // inbox never shows something unread that the user already saw (the heartbeat alone lags 30 s).
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Supabase query builders are lazy: the request is only sent once awaited or `.then`-ed,
  // so a bare `void supabase.rpc(...)` silently does nothing.
  const touchNow = useCallback(() => {
    void supabase.rpc("touch_conversation", { p_conversation_id: conversationId }).then(({ error }) => {
      if (error) console.warn("touch_conversation failed", error.message);
    });
  }, [supabase, conversationId]);
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => { readTimer.current = null; touchNow(); }, 200);
  }, [touchNow]);

  // Realtime is best-effort (a dropped socket or a tenant rate cap loses broadcasts), so also pull
  // anything newer than what we have on every heartbeat, on refocus and on reconnect.
  const latest = useRef(initialMessages.at(-1)?.created_at ?? null);
  useEffect(() => { latest.current = messages.at(-1)?.created_at ?? latest.current; }, [messages]);
  const catchUp = useCallback(async () => {
    let q = supabase.from("messages").select("id, sender_attendee, client_msg_id, body, created_at")
      .eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(100);
    if (latest.current) q = q.gt("created_at", latest.current);
    const { data } = await q;
    if (data?.length) {
      setMessages((m) => merge(m, data));
      if (data.some((m) => m.sender_attendee !== me)) markRead();
    }
  }, [supabase, conversationId, me, markRead]);

  // Sends every queued message (all conversations) through the idempotent RPC.
  const flushNow = useCallback(async () => {
    const send = async (item: OutboxItem): Promise<SendResult> => {
      const { data, error } = await supabase.rpc("send_message", {
        p_conversation_id: item.conversation_id, p_client_msg_id: item.client_msg_id, p_body: item.body,
      });
      if (!error) {
        const row = (data as Message[] | null)?.[0];
        if (row && item.conversation_id === conversationId) setMessages((m) => merge(m, [row]));
        return { ok: true };
      }
      // No code = the request never reached the database (offline, timeout): retry later.
      const retry = !error.code || /too quickly/.test(error.message);
      return { ok: false, retry, error: error.message };
    };
    await flush(send);
    await refreshOutbox();
  }, [supabase, conversationId, refreshOutbox]);

  // Realtime: messages for this conversation (from the partner, or from my other devices).
  useChannel(`user:${userId}`, (event, payload) => {
    if (event !== "message" || payload.conversation_id !== conversationId) return;
    setMessages((m) => merge(m, [payload as unknown as Message]));
    if (payload.sender_attendee !== me) markRead();
    void refreshOutbox();
  });

  // Outbox retries: on mount, when connectivity returns, when the tab becomes visible, and periodically.
  useEffect(() => {
    void refreshOutbox().then(flushNow);
    const onOnline = () => { setOnline(true); void flushNow(); void catchUp(); };
    const onOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === "visible") { void flushNow(); void catchUp(); } };
    setOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const retry = setInterval(() => { if (navigator.onLine) void flushNow(); }, 15_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(retry);
    };
  }, [flushNow, refreshOutbox, catchUp]);

  // Heartbeat while the conversation is on screen: marks it read and suppresses pushes (§4.5).
  useEffect(() => {
    const touch = () => {
      if (document.visibilityState !== "visible") return;
      touchNow();
      void catchUp();
    };
    touch();
    const beat = setInterval(touch, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", touch);
    return () => {
      clearInterval(beat);
      document.removeEventListener("visibilitychange", touch);
      // Leaving with a mark-read still debounced: send it now.
      if (readTimer.current) {
        clearTimeout(readTimer.current);
        touchNow();
      }
    };
  }, [touchNow, catchUp]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages.length, outbox.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await enqueue({ client_msg_id: uuidv4(), conversation_id: conversationId, body, created_at: new Date().toISOString() });
    await refreshOutbox();
    void flushNow();
  };

  const loadOlder = async () => {
    const oldest = messages[0]?.created_at;
    const { data } = await supabase.from("messages").select("id, sender_attendee, client_msg_id, body, created_at")
      .eq("conversation_id", conversationId).lt("created_at", oldest).order("created_at", { ascending: false }).limit(PAGE);
    setMessages((m) => merge(m, data ?? []));
    setHasOlder((data ?? []).length === PAGE);
  };

  const block = () => {
    if (!partner.id || !confirm(`Block ${partner.name}? You won't see each other and this chat closes.`)) return;
    startBlock(async () => { await blockAttendee(slug, partner.id!); router.refresh(); });
  };

  const delivered = new Set(messages.map((m) => m.client_msg_id));
  const pending = outbox.filter((o) => !delivered.has(o.client_msg_id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/inbox" className="text-sm text-muted hover:text-fg">← Inbox</Link>
          <h1 className="truncate text-xl font-semibold">{partner.name}</h1>
          {partner.headline && <p className="truncate text-sm text-muted">{partner.headline}</p>}
        </div>
        {partner.id && !readOnlyReason && (
          <div className="flex shrink-0 gap-3 pt-6 text-sm">
            <ReportDialog slug={slug} attendeeId={partner.id} name={partner.name} label="Report" />
            <button type="button" disabled={blocking} onClick={block} className="text-danger underline">Block</button>
          </div>
        )}
      </div>

      {!online && (
        <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-fg">
          You&apos;re offline. Messages will send when you reconnect.
        </p>
      )}

      <ol aria-label="Messages" className="flex flex-col gap-2">
        {hasOlder && (
          <li className="text-center">
            <button type="button" onClick={loadOlder} className="text-sm text-primary underline">Load earlier messages</button>
          </li>
        )}
        {messages.length === 0 && pending.length === 0 && (
          <li className="py-8 text-center text-muted">You&apos;re connected. Say hello!</li>
        )}
        {messages.map((m) => {
          const mine = m.sender_attendee === me;
          return (
            <li key={m.id} className={`group flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 ${
                mine ? "rounded-br-md bg-primary text-primary-fg" : "rounded-bl-md bg-surface text-fg ring-1 ring-border"}`}>
                {m.body}
              </div>
              <span className="mt-0.5 flex gap-2 px-1 text-xs text-muted">
                {time.format(new Date(m.created_at))}
                {!mine && partner.id && m.sender_attendee && (
                  <ReportDialog slug={slug} attendeeId={partner.id} name={partner.name} messageId={m.id}
                                messagePreview={m.body} label="Report" className="text-xs text-muted underline hover:text-fg" />
                )}
              </span>
            </li>
          );
        })}
        {pending.map((p) => (
          <li key={p.client_msg_id} className="flex flex-col items-end">
            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary/60 px-3.5 py-2 text-primary-fg">
              {p.body}
            </div>
            <span className={`mt-0.5 px-1 text-xs ${p.error ? "text-danger" : "text-muted"}`}>
              {p.error ? `Not sent: ${p.error}` : "Sending…"}
            </span>
          </li>
        ))}
      </ol>
      <div ref={bottom} />

      {readOnlyReason ? (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted">{READ_ONLY_TEXT[readOnlyReason] ?? "This conversation is read-only."}</p>
      ) : (
        <form onSubmit={send} className="sticky bottom-0 -mx-4 flex items-end gap-2 border-t border-border bg-canvas/95 px-4 py-3 backdrop-blur">
          <label htmlFor="composer" className="sr-only">Message {partner.name}</label>
          <textarea id="composer" value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} maxLength={2000}
                    placeholder="Write a message…" className={`${inputClass} max-h-40 resize-none`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); }
                    }} />
          <Button type="submit" disabled={!draft.trim()}>Send</Button>
        </form>
      )}
    </div>
  );
}
