import { describe, expect, it } from "vitest";
import { joinBuckets, percent } from "@/lib/analytics";

describe("joinBuckets", () => {
  it("fills missing hours with zero for short spans", () => {
    const { unit, buckets } = joinBuckets([
      { hour: "2026-11-03T11:00", joins: 2 },
      { hour: "2026-11-03T09:00", joins: 5 },
    ]);
    expect(unit).toBe("hour");
    expect(buckets.map((b) => [b.key, b.joins])).toEqual([
      ["2026-11-03T09:00", 5], ["2026-11-03T10:00", 0], ["2026-11-03T11:00", 2],
    ]);
    expect(buckets[0].label).toBe("Nov 3, 9 AM");
  });

  it("groups by day past 48 hours", () => {
    const { unit, buckets } = joinBuckets([
      { hour: "2026-11-01T09:00", joins: 1 },
      { hour: "2026-11-01T17:00", joins: 2 },
      { hour: "2026-11-04T08:00", joins: 4 },
    ]);
    expect(unit).toBe("day");
    expect(buckets.map((b) => [b.label, b.joins])).toEqual([["Nov 1", 3], ["Nov 2", 0], ["Nov 3", 0], ["Nov 4", 4]]);
  });

  it("handles no joins", () => {
    expect(joinBuckets([]).buckets).toEqual([]);
  });
});

describe("percent", () => {
  it("rounds and guards against zero", () => {
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 0)).toBeNull();
  });
});
