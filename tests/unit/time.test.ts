import { describe, expect, it } from "vitest";
import { formatEventRange, isValidTimeZone, utcToZonedLocal, zonedLocalToUtc } from "@/lib/time";

describe("zonedLocalToUtc", () => {
  it("converts standard and daylight times in New York", () => {
    expect(zonedLocalToUtc("2026-11-03T09:00", "America/New_York").toISOString()).toBe("2026-11-03T14:00:00.000Z");
    expect(zonedLocalToUtc("2026-07-01T09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });
  it("handles zones east of UTC and half-hour offsets", () => {
    expect(zonedLocalToUtc("2026-03-01T10:00", "Asia/Kolkata").toISOString()).toBe("2026-03-01T04:30:00.000Z");
    expect(zonedLocalToUtc("2026-07-01T10:00", "Europe/Berlin").toISOString()).toBe("2026-07-01T08:00:00.000Z");
  });
  it("takes the earlier instant for an ambiguous fall-back time", () => {
    // 2026-11-01 01:30 happens twice in New York (EDT then EST).
    expect(zonedLocalToUtc("2026-11-01T01:30", "America/New_York").toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
  it("moves a nonexistent spring-forward time forward", () => {
    // 2026-03-08 02:30 does not exist in New York.
    expect(zonedLocalToUtc("2026-03-08T02:30", "America/New_York").toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });
  it("rejects malformed input", () => expect(() => zonedLocalToUtc("2026-11-03", "UTC")).toThrow());
});

describe("utcToZonedLocal", () => {
  it("round-trips", () => {
    for (const [local, tz] of [["2026-11-03T09:00", "America/New_York"], ["2026-03-01T10:00", "Asia/Kolkata"]]) {
      expect(utcToZonedLocal(zonedLocalToUtc(local, tz), tz)).toBe(local);
    }
  });
});

it("isValidTimeZone", () => {
  expect(isValidTimeZone("Europe/Paris")).toBe(true);
  expect(isValidTimeZone("Mars/Olympus")).toBe(false);
});

it("formatEventRange renders in the event zone", () => {
  expect(formatEventRange("2026-11-03T14:00:00Z", "2026-11-04T23:00:00Z", "America/New_York")).toBe(
    "Tue, Nov 3, 9:00 AM – Wed, Nov 4, 6:00 PM EST",
  );
});
