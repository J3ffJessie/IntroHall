// Analytics CSV download and the post-event summary. Totals only, like the analytics page.
import { type EventAnalytics, joinBuckets, percent } from "@/lib/analytics";
import { csvField } from "@/lib/contacts-export";
import { openToLabel } from "@/lib/open-to";

export type InterestTotal = { label: string; attendees: number };
export type AnalyticsEvent = { name: string; slug: string; starts_at: string; ends_at: string; timezone: string };

/** "2026-11-03 09:00" in the event's time zone. */
export function localDateTime(iso: string, timeZone: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

const pct = (part: number, whole: number) => {
  const v = percent(part, whole);
  return v === null ? "" : String(v);
};

/**
 * One table, three columns (Section, Item, Value), so it opens cleanly in Excel or Sheets and can be
 * filtered by section. `interests` is every visible interest, not just the top 10 shown on the page.
 */
export function analyticsCsv(data: EventAnalytics, interests: InterestTotal[], event: AnalyticsEvent, now = new Date()): string {
  const rows: (string | number)[][] = [
    ["Section", "Item", "Value"],
    ["Event", "Name", event.name],
    ["Event", "Starts", localDateTime(event.starts_at, event.timezone)],
    ["Event", "Ends", localDateTime(event.ends_at, event.timezone)],
    ["Event", "Time zone", event.timezone],
    ["Event", "Exported", localDateTime(now.toISOString(), event.timezone)],
    ["Attendance", "Joined", data.joined],
    ["Attendance", "Completed profiles", data.completed],
    ["Attendance", "Completed profiles (% of joined)", pct(data.completed, data.joined)],
    ["Attendance", "Still in the event", data.active],
    ["Attendance", "Left", data.left],
    ["Attendance", "Removed", data.removed],
    ["Networking", "Connection requests sent", data.requests_sent],
    ["Networking", "Connection requests accepted", data.requests_accepted],
    ["Networking", "Accepted (% of sent)", pct(data.requests_accepted, data.requests_sent)],
    ["Networking", "Conversations started", data.conversations_started],
    ...[...data.joins_by_hour].sort((a, b) => a.hour.localeCompare(b.hour))
      .map((r) => ["Joins by hour", r.hour.replace("T", " "), r.joins]),
    ...interests.map((t) => ["Interests", t.label, t.attendees]),
    ...data.open_to.map((o) => ["Open to", openToLabel(o.intent), o.attendees]),
  ];
  // BOM so Excel opens UTF-8 labels correctly.
  return "﻿" + rows.map((r) => r.map((v) => csvField(String(v))).join(",")).join("\r\n") + "\r\n";
}

export function analyticsFilename(slug: string): string {
  return `introhall-${slug}-analytics.csv`;
}

/** The summary appears once the event is over. */
export function eventHasEnded(event: { ends_at: string; status: string }, now = new Date()): boolean {
  return event.status === "archived" || Date.parse(event.ends_at) <= now.getTime();
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function list(items: InterestTotal[]): string {
  return items.map((t) => `${t.label} (${t.attendees.toLocaleString("en-US")})`).join(", ");
}

/** Plain-language highlights for the post-event summary, most important first. */
export function summaryHighlights(data: EventAnalytics): string[] {
  if (data.joined === 0) return ["No one joined this event."];
  const out: string[] = [];
  const completed = percent(data.completed, data.joined);
  out.push(`${plural(data.joined, "person", "people")} joined and ${data.completed.toLocaleString("en-US")} (${completed}%) completed a profile.`);

  if (data.requests_sent > 0) {
    const accepted = percent(data.requests_accepted, data.requests_sent);
    out.push(`${plural(data.requests_sent, "connection request")} sent; ${data.requests_accepted.toLocaleString("en-US")} accepted (${accepted}%).`);
  } else {
    out.push("No connection requests were sent.");
  }
  if (data.conversations_started > 0) out.push(`${plural(data.conversations_started, "conversation")} started.`);

  const { unit, buckets } = joinBuckets(data.joins_by_hour);
  if (buckets.length > 1) {
    const peak = buckets.reduce((a, b) => (b.joins > a.joins ? b : a));
    out.push(`Busiest ${unit} for joining: ${peak.label}, with ${plural(peak.joins, "join")}.`);
  }

  const tags = data.top_tags.filter((t) => !t.hidden).slice(0, 3);
  if (tags.length) out.push(`Most popular ${tags.length === 1 ? "interest" : "interests"}: ${list(tags)}.`);

  const open = data.open_to.slice(0, 3).map((o) => ({ label: openToLabel(o.intent), attendees: o.attendees }));
  if (open.length) out.push(`Most people were open to: ${list(open)}.`);

  if (data.left + data.removed > 0) {
    const parts = [data.left && `${plural(data.left, "person", "people")} left the event`,
                   data.removed && `${plural(data.removed, "person", "people")} ${data.removed === 1 ? "was" : "were"} removed`];
    out.push(`${parts.filter(Boolean).join("; ")}.`);
  }
  return out;
}
