import { describe, expect, it } from "vitest";
import { parseAnalytics } from "@/lib/analytics";
import { parseEventProfileForm } from "@/lib/event-profile";
import { complementary, isOpenTo, normalizeOpenTo, OPEN_TO, openToLabel } from "@/lib/open-to";

describe("open-to options", () => {
  it("matches the CHECK constraint keys", () => {
    // Keep in sync with attendees_open_to_valid in supabase/migrations/20261113000000_open_to.sql.
    expect(OPEN_TO.map((o) => o.key)).toEqual(
      ["hiring", "job_seeking", "mentoring", "seeking_mentor", "cofounder", "investing", "fundraising"]);
  });

  it("pairs are symmetric", () => {
    for (const o of OPEN_TO) expect(OPEN_TO.find((x) => x.key === o.pairs)?.pairs).toBe(o.key);
  });

  it("validates and labels keys", () => {
    expect(isOpenTo("hiring")).toBe(true);
    expect(isOpenTo("dating")).toBe(false);
    expect(isOpenTo(undefined)).toBe(false);
    expect(openToLabel("job_seeking")).toBe("Looking for work");
    expect(openToLabel("unknown")).toBe("unknown");
  });

  it("normalizes to valid, unique keys in display order", () => {
    expect(normalizeOpenTo(["fundraising", "hiring", "bogus", "hiring", 3])).toEqual(["hiring", "fundraising"]);
    expect(normalizeOpenTo(null)).toEqual([]);
  });

  it("finds their intents that pair with mine", () => {
    expect(complementary(["hiring"], ["job_seeking", "mentoring"])).toEqual(["job_seeking"]);
    expect(complementary(["seeking_mentor", "fundraising"], ["investing", "mentoring", "hiring"])).toEqual(["mentoring", "investing"]);
    expect(complementary(["cofounder"], ["cofounder"])).toEqual(["cofounder"]);
    expect(complementary(["hiring"], ["hiring"])).toEqual([]);
    expect(complementary([], ["hiring"])).toEqual([]);
  });
});

describe("event profile form: open_to", () => {
  const form = (open: string[]) => {
    const f = new FormData();
    for (const [k, v] of [["full_name", "Ada"], ["headline", ""], ["company", ""], ["bio", ""], ["looking_for", ""],
                          ["tag_id", "00000000-0000-4000-8000-000000000001"]]) f.append(k, v);
    open.forEach((o) => f.append("open_to", o));
    return f;
  };

  it("is optional, de-duplicated and ordered", () => {
    expect(parseEventProfileForm(form([])).data?.open_to).toEqual([]);
    expect(parseEventProfileForm(form(["mentoring", "hiring", "hiring"])).data?.open_to).toEqual(["hiring", "mentoring"]);
  });

  it("rejects unknown options", () => {
    expect(parseEventProfileForm(form(["dating"])).error?.issues[0].message).toMatch(/Unknown/);
  });
});

describe("analytics open_to", () => {
  const base = { joined: 0, completed: 0, active: 0, left: 0, removed: 0, requests_sent: 0, requests_accepted: 0,
                 conversations_started: 0, joins_by_hour: [], top_tags: [] };
  it("parses totals and defaults to none", () => {
    expect(parseAnalytics(base).open_to).toEqual([]);
    expect(parseAnalytics({ ...base, open_to: [{ intent: "hiring", attendees: 4 }] }).open_to).toEqual([{ intent: "hiring", attendees: 4 }]);
  });
});
