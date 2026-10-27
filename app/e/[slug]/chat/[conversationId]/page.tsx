import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AttendeeShell } from "@/components/events/attendee-shell";
import { ChatView } from "@/components/events/chat-view";
import { getAttendance } from "@/lib/attendance";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function ChatPage({ params }: { params: Promise<{ slug: string; conversationId: string }> }) {
  const { slug, conversationId } = await params;
  const data = await getAttendance(slug);
  if (!data) notFound();
  const { event, supabase, user, active } = data;
  if (!user || !active) redirect("/join");

  const [{ data: conversations }, { data: messages }] = await Promise.all([
    supabase.rpc("get_conversations", { p_event_id: event.id }),
    supabase.from("messages").select("id, sender_attendee, client_msg_id, body, created_at")
      .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(50),
  ]);
  const convo = (conversations ?? []).find((c) => c.conversation_id === conversationId);
  if (!convo) notFound();

  return (
    <AttendeeShell eventName={event.name} current="inbox" userId={user.id} liveEvents={["request", "conversation"]}
                   inboxCount={(conversations ?? []).reduce((n, c) => n + (c.conversation_id === conversationId ? 0 : c.unread), 0)}>
      <ChatView
        slug={slug}
        conversationId={conversationId}
        userId={user.id}
        me={active.id}
        partner={{ id: convo.other_attendee, name: convo.full_name, headline: convo.headline }}
        readOnlyReason={convo.read_only_reason}
        initialMessages={(messages ?? []).reverse()}
        timeZone={event.timezone}
      />
    </AttendeeShell>
  );
}
