import type { Metadata } from "next";
import { AddressBook, ChatsCircle, DownloadSimple, HandWaving, NotePencil, PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { AttendeeShell } from "@/components/events/attendee-shell";
import { RequestActions, WithdrawButton } from "@/components/events/request-actions";
import { buttonClass, Card } from "@/components/ui";
import { getAttendance } from "@/lib/attendance";

export const metadata: Metadata = { title: "Inbox", robots: { index: false } };

const READ_ONLY_LABEL: Record<string, string> = { blocked: "Blocked", left: "Left the event", event_closed: "Event ended", account_deleted: "Account deleted" };

export default async function InboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getAttendance(slug);
  if (!data) notFound();
  const { event, supabase, user, active } = data;
  if (!user || !active) redirect("/join");
  if (!active.completed_at) redirect("/setup");

  const [{ data: connections }, { data: conversations }, { data: notes }] = await Promise.all([
    supabase.rpc("get_connections", { p_event_id: event.id }),
    supabase.rpc("get_conversations", { p_event_id: event.id }),
    supabase.from("connection_notes").select("about_attendee, body").eq("event_id", event.id),
  ]);
  const noteAbout = new Map((notes ?? []).map((n) => [n.about_attendee, n.body]));
  const incoming = (connections ?? []).filter((c) => c.direction === "incoming" && c.status === "pending");
  const outgoing = (connections ?? []).filter((c) => c.direction === "outgoing" && c.status === "pending");
  const connectedCount = (connections ?? []).filter((c) => c.status === "accepted").length;
  const chats = conversations ?? [];
  const badge = incoming.length + chats.reduce((n, c) => n + (c.unread ?? 0), 0);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: event.timezone, hour: "numeric", minute: "2-digit" });

  return (
    <AttendeeShell eventName={event.name} current="inbox" inboxCount={badge} userId={user.id}>
      <h1 className="text-2xl font-semibold">Inbox</h1>

      {incoming.length > 0 && (
        <Card title={`Requests (${incoming.length})`} icon={<HandWaving weight="duotone" />}>
          <ul className="flex flex-col divide-y divide-border">
            {incoming.map((r) => (
              <li key={r.request_id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <Avatar name={r.full_name} path={r.avatar_path} />
                  <div className="min-w-0">
                    <p className="font-semibold">{r.full_name}</p>
                    {(r.headline || r.company) && <p className="text-sm text-muted-foreground">{[r.headline, r.company].filter(Boolean).join(" · ")}</p>}
                  </div>
                </div>
                {r.note && <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm">“{r.note}”</p>}
                <RequestActions slug={slug} requestId={r.request_id} attendeeId={r.other_attendee} name={r.full_name} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Chats" icon={<ChatsCircle weight="duotone" />}>
        {chats.length === 0 ? (
          <p className="text-muted-foreground">No conversations yet. Connect with someone from <Link href="/home" className="text-primary underline">Matches</Link>.</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {chats.map((c) => (
              <li key={c.conversation_id}>
                <Link href={`/chat/${c.conversation_id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface-muted">
                  <Avatar name={c.full_name} path={c.avatar_path} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate ${c.unread > 0 ? "font-semibold" : "font-medium"}`}>
                      {c.full_name}
                      {c.read_only_reason && (
                        <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                          {READ_ONLY_LABEL[c.read_only_reason] ?? "Read-only"}
                        </span>
                      )}
                    </p>
                    <p className={`truncate text-sm ${c.unread > 0 ? "text-fg" : "text-muted-foreground"}`}>
                      {c.last_message ?? "Say hello 👋"}
                    </p>
                    {c.other_attendee && noteAbout.has(c.other_attendee) && (
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <NotePencil aria-hidden className="size-3.5 shrink-0" />
                        <span className="sr-only">Your note: </span>
                        <span className="truncate">{noteAbout.get(c.other_attendee)}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {c.last_message_at && <span className="text-xs text-muted-foreground">{time.format(new Date(c.last_message_at))}</span>}
                    {c.unread > 0 && (
                      <span className="inline-flex min-w-5 justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                        {c.unread}<span className="sr-only"> unread</span>
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {outgoing.length > 0 && (
        <Card title={`Sent (${outgoing.length})`} icon={<PaperPlaneTilt weight="duotone" />}>
          <ul className="flex flex-col divide-y divide-border">
            {outgoing.map((r) => (
              <li key={r.request_id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="min-w-0 truncate">{r.full_name} <span className="text-sm text-muted-foreground">· waiting</span></span>
                <WithdrawButton slug={slug} requestId={r.request_id} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {connectedCount > 0 && (
        <Card title="Export contacts" icon={<AddressBook weight="duotone" />}>
          <p className="text-sm text-muted-foreground">
            Save your {connectedCount === 1 ? "connection" : `${connectedCount} connections`} with names, companies,
            profile links and your private notes. Works after the event, too.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/contacts?format=vcf" download className={buttonClass.secondary}>
              <DownloadSimple aria-hidden /> Contacts (vCard)
            </a>
            <a href="/contacts?format=csv" download className={buttonClass.secondary}>
              <DownloadSimple aria-hidden /> Spreadsheet (CSV)
            </a>
          </div>
        </Card>
      )}
    </AttendeeShell>
  );
}
