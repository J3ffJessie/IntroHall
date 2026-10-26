import { describe, expect, it } from "vitest";
import { rankMatches, tagWeight } from "@/lib/matching/score";

// Same fixtures as supabase/tests/database/03_matching.test.sql.
describe("matching score mirror", () => {
  it("a 2/100 shared tag outranks a 50/100 shared tag", () => {
    const counts = new Map([["rare", 2], ["common", 50]]);
    const ranked = rankMatches(["rare", "common"], [
      { id: "y", tags: ["common"], completedAt: 2 },
      { id: "x", tags: ["rare"], completedAt: 1 },
    ], 100, counts);
    expect(ranked.map((r) => r.id)).toEqual(["x", "y"]);
    expect(ranked[0].score).toBeCloseTo(Math.log(1 + 100 / 2), 10);
  });

  it("with N = 10, a tag held by 9 contributes > 0", () => expect(tagWeight(10, 9)).toBeGreaterThan(0));

  it("a tag with no stats row counts as held by 1", () => expect(tagWeight(10, undefined)).toBeCloseTo(Math.log(11), 10));

  it("ties break on the most recently completed profile; non-sharers are excluded", () => {
    const ranked = rankMatches(["a"], [
      { id: "old", tags: ["a"], completedAt: 1 },
      { id: "new", tags: ["a"], completedAt: 5 },
      { id: "none", tags: ["b"], completedAt: 9 },
    ], 10, new Map([["a", 3]]));
    expect(ranked.map((r) => r.id)).toEqual(["new", "old"]);
  });
});
