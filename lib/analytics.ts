import { z } from "zod";

const analyticsSchema = z.object({
  joined: z.number(),
  completed: z.number(),
  active: z.number(),
  left: z.number(),
  removed: z.number(),
  requests_sent: z.number(),
  requests_accepted: z.number(),
  conversations_started: z.number(),
  joins_by_hour: z.array(z.object({ hour: z.string(), joins: z.number() })),
  top_tags: z.array(z.object({ label: z.string(), attendees: z.number(), hidden: z.boolean() })),
});
export type EventAnalytics = z.infer<typeof analyticsSchema>;

export function parseAnalytics(json: unknown): EventAnalytics {
  return analyticsSchema.parse(json);
}

/** Whole-number percentage, or null when there is nothing to divide by. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export type JoinBucket = { key: string; label: string; joins: number };

/**
 * Joins over time for a column chart. Hours are local to the event ("YYYY-MM-DDTHH:00"); gaps are
 * filled with zeros so the axis is continuous. Spans over 48 hours are grouped by day instead.
 */
export function joinBuckets(rows: { hour: string; joins: number }[]): { unit: "hour" | "day"; buckets: JoinBucket[] } {
  if (!rows.length) return { unit: "hour", buckets: [] };
  const toMs = (h: string) => Date.parse(`${h}:00Z`);
  const sorted = [...rows].sort((a, b) => a.hour.localeCompare(b.hour));
  const first = toMs(sorted[0].hour);
  const last = toMs(sorted[sorted.length - 1].hour);
  const byHour = new Map(sorted.map((r) => [r.hour, r.joins]));
  const HOUR = 3_600_000;

  if ((last - first) / HOUR < 48) {
    const buckets: JoinBucket[] = [];
    for (let t = first; t <= last; t += HOUR) {
      const key = new Date(t).toISOString().slice(0, 13) + ":00";
      buckets.push({ key, label: hourLabel(key), joins: byHour.get(key) ?? 0 });
    }
    return { unit: "hour", buckets };
  }

  const byDay = new Map<string, number>();
  for (const r of sorted) byDay.set(r.hour.slice(0, 10), (byDay.get(r.hour.slice(0, 10)) ?? 0) + r.joins);
  const buckets: JoinBucket[] = [];
  for (let t = Date.parse(`${sorted[0].hour.slice(0, 10)}T00:00:00Z`); t <= last; t += 24 * HOUR) {
    const key = new Date(t).toISOString().slice(0, 10);
    buckets.push({ key, label: dayLabel(key), joins: byDay.get(key) ?? 0 });
  }
  return { unit: "day", buckets };
}

function hourLabel(key: string): string {
  const d = new Date(`${key}:00Z`);
  return `${dayLabel(key.slice(0, 10))}, ${d.toLocaleTimeString("en-US", { hour: "numeric", timeZone: "UTC" })}`;
}

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
