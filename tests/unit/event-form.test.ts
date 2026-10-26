import { describe, expect, it } from "vitest";
import { parseEventForm } from "@/lib/event-form";

const form = (overrides: Record<string, string> = {}) => {
  const f = new FormData();
  const base = {
    name: "DevConf", slug: "devconf", description: "", venue: "", timezone: "America/New_York",
    starts_local: "2026-11-03T09:00", ends_local: "2026-11-04T18:00", retention_days: "30",
    allow_custom_interests: "on", max_custom_interests: "3",
  };
  Object.entries({ ...base, ...overrides }).forEach(([k, v]) => f.set(k, v));
  return f;
};

describe("parseEventForm", () => {
  it("converts wall-clock times in the event zone to UTC", () => {
    const res = parseEventForm(form());
    expect(res.success && res.data).toMatchObject({
      starts_at: "2026-11-03T14:00:00.000Z", ends_at: "2026-11-04T23:00:00.000Z", allow_custom_interests: true,
    });
  });
  it.each([
    [{ slug: "app" }, /reserved/],
    [{ slug: "Bad_Slug" }, /lowercase/],
    [{ ends_local: "2026-11-03T08:00" }, /end after/],
    [{ ends_local: "2026-12-30T08:00" }, /31 days/],
    [{ retention_days: "6" }, /7–90/],
    [{ retention_days: "91" }, /7–90/],
    [{ timezone: "Mars/Olympus" }, /time zone/],
  ])("rejects %o", (overrides, message) => {
    const res = parseEventForm(form(overrides as Record<string, string>));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0].message).toMatch(message);
  });
});
