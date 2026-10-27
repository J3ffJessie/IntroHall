import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AttendeeShell } from "@/components/events/attendee-shell";
import { MatchCard } from "@/components/events/match-card";
import { getAttendance } from "@/lib/attendance";
import { connectionMap } from "@/lib/connection-state";
import { inboxCount } from "@/lib/inbox";

export const metadata: Metadata = { title: "Matches", robots: { index: false } };

const PAGE_SIZE = 30;

type Search = { tab?: string; tag?: string; page?: string };

export default async function MatchesPage({ params, searchParams }:
  { params: Promise<{ slug: string }>; searchParams: Promise<Search> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await getAttendance(slug);
  if (!data) notFound();
  const { event, supabase, user, active } = data;
  if (!user || !active) redirect("/join");
  if (!active.completed_at) redirect("/setup");

  const tab = sp.tab === "everyone" ? "everyone" : "matches";
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const [{ data: tags }, { data: people, error }, { data: connections }, badge] = await Promise.all([
    supabase.rpc("get_event_tag_counts", { p_event_id: event.id }),
    supabase.rpc("get_matches", {
      p_event_id: event.id, p_mode: tab, p_tag: sp.tag || undefined,
      // One extra row tells us whether there is a next page.
      p_limit: PAGE_SIZE + 1, p_offset: page * PAGE_SIZE,
    }),
    supabase.rpc("get_connections", { p_event_id: event.id }),
    inboxCount(supabase, event.id),
  ]);
  const conn = connectionMap(connections ?? []);
  if (error) throw new Error(error.message);
  const rows = (people ?? []).slice(0, PAGE_SIZE);
  const hasNext = (people ?? []).length > PAGE_SIZE;
  const tagList = (tags ?? []).sort((a, b) => Number(b.mine) - Number(a.mine) || b.holders - a.holders);
  const activeTag = tagList.find((t) => t.tag_id === sp.tag);

  const href = (next: Partial<Search>) => {
    const q = new URLSearchParams();
    const merged = { tab, tag: sp.tag, ...next };
    if (merged.tab === "everyone") q.set("tab", "everyone");
    if (merged.tag) q.set("tag", merged.tag);
    if (merged.page && merged.page !== "0") q.set("page", merged.page);
    const s = q.toString();
    return s ? `/home?${s}` : "/home";
  };

  return (
    <AttendeeShell eventName={event.name} current="matches" inboxCount={badge} userId={user.id} liveEvents={["request", "conversation"]}>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{tab === "matches" ? "People who share your interests" : "Everyone else"}</h1>
        <p className="text-muted">
          {tab === "matches"
            ? "Ranked by shared interests. Rarer interests count for more."
            : "Attendees you don't share an interest with yet. Great for serendipity."}
        </p>
      </div>

      <nav aria-label="Lists" className="flex gap-1 rounded-xl bg-surface-muted p-1 text-sm">
        {(["matches", "everyone"] as const).map((t) => (
          <Link key={t} href={href({ tab: t, page: "0" })} aria-current={tab === t ? "page" : undefined}
                className={`flex-1 rounded-lg px-3 py-2 text-center font-medium ${
                  tab === t ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
            {t === "matches" ? "Matches" : "Everyone"}
          </Link>
        ))}
      </nav>

      {tagList.length > 0 && (
        <nav aria-label="Filter by interest" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex gap-2 pb-1">
            <li>
              <Link href={href({ tag: "", page: "0" })} aria-current={!activeTag ? "true" : undefined}
                    className={chip(!activeTag)}>All</Link>
            </li>
            {tagList.map((t) => (
              <li key={t.tag_id}>
                <Link href={href({ tag: t.tag_id, page: "0" })} aria-current={activeTag?.tag_id === t.tag_id ? "true" : undefined}
                      className={chip(activeTag?.tag_id === t.tag_id)}>
                  {t.label} <span className="opacity-70">{t.holders}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong p-6 text-center text-muted">
          {tab === "matches"
            ? activeTag
              ? `No one with “${activeTag.label}” shares your interests yet.`
              : "No one shares your interests yet. Check back as more people join, or browse Everyone."
            : "No one here yet."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={tab === "matches" ? "Matches" : "Everyone"}>
          {rows.map((p) => (
            <li key={p.attendee_id}>
              <MatchCard person={p} slug={slug} connection={conn.get(p.attendee_id) ?? { state: "none" }} />
            </li>
          ))}
        </ul>
      )}

      {(page > 0 || hasNext) && (
        <nav aria-label="Pages" className="flex justify-between text-sm">
          {page > 0 ? <Link href={href({ page: String(page - 1) })} className="text-primary underline">← Previous</Link> : <span />}
          {hasNext && <Link href={href({ page: String(page + 1) })} className="text-primary underline">Next →</Link>}
        </nav>
      )}
    </AttendeeShell>
  );
}

function chip(on: boolean) {
  return `inline-flex whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium ${
    on ? "border-primary bg-primary text-primary-fg" : "border-border-strong bg-surface text-fg hover:border-primary"}`;
}
