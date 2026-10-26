// All event times are entered and shown in events.timezone (§1). The DB stores UTC.

/** Offset (ms) of `timeZone` from UTC at the instant `utcMs`. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Wall-clock "YYYY-MM-DDTHH:mm" in `timeZone` → UTC Date.
 * Nonexistent times (spring-forward gap) resolve forward; ambiguous ones (fall-back) take the earlier instant.
 */
export function zonedLocalToUtc(local: string, timeZone: string): Date {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) throw new Error(`Invalid local datetime: ${local}`);
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const first = wall - zoneOffsetMs(wall, timeZone);
  const second = wall - zoneOffsetMs(first, timeZone);
  if (first === second) return new Date(first);
  // Offsets disagree near a transition: prefer a candidate that maps back to the same wall time, earliest first.
  const candidates = [Math.min(first, second), Math.max(first, second)];
  const exact = candidates.find((c) => c + zoneOffsetMs(c, timeZone) === wall);
  return new Date(exact ?? Math.max(first, second));
}

/** UTC instant → "YYYY-MM-DDTHH:mm" wall clock in `timeZone` (for datetime-local inputs). */
export function utcToZonedLocal(date: Date | string, timeZone: string): string {
  const ms = new Date(date).getTime();
  return new Date(ms + zoneOffsetMs(ms, timeZone)).toISOString().slice(0, 16);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** "Tue, Nov 3, 9:00 AM – Wed, Nov 4, 6:00 PM EST" in the event's zone. */
export function formatEventRange(start: string | Date, end: string | Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const tz = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(new Date(end)).find((p) => p.type === "timeZoneName")?.value;
  return `${fmt.format(new Date(start))} – ${fmt.format(new Date(end))}${tz ? ` ${tz}` : ""}`;
}
