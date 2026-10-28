import { describe, expect, it } from "vitest";
import { parseAnnouncementForm } from "@/lib/announcement-form";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  Object.entries({ title: "Doors open", body: "", when: "schedule", ...o }).forEach(([k, v]) => f.set(k, v));
  return f;
};
const NY = "America/New_York";
const before = new Date("2026-10-01T00:00:00Z");

describe("parseAnnouncementForm scheduling across DST (America/New_York)", () => {
  it("9:00 on the day after fall-back is 14:00 UTC (EST)", () => {
    const r = parseAnnouncementForm(form({ publish_local: "2026-11-02T09:00" }), NY, before);
    expect(r.success && r.data.publish_at).toBe("2026-11-02T14:00:00.000Z");
  });
  it("9:00 on the day before fall-back is 13:00 UTC (EDT)", () => {
    const r = parseAnnouncementForm(form({ publish_local: "2026-10-31T09:00" }), NY, before);
    expect(r.success && r.data.publish_at).toBe("2026-10-31T13:00:00.000Z");
  });
  it("the repeated 01:30 on fall-back night resolves to the first (EDT) occurrence", () => {
    const r = parseAnnouncementForm(form({ publish_local: "2026-11-01T01:30" }), NY, before);
    expect(r.success && r.data.publish_at).toBe("2026-11-01T05:30:00.000Z");
  });
  it("the nonexistent 02:30 on spring-forward night moves to 03:30 EDT", () => {
    const r = parseAnnouncementForm(form({ publish_local: "2027-03-14T02:30" }), NY, before);
    expect(r.success && r.data.publish_at).toBe("2027-03-14T07:30:00.000Z");
  });
});

describe("parseAnnouncementForm validation", () => {
  it("post now has no publish_at", () => {
    const r = parseAnnouncementForm(form({ when: "now", pinned: "on" }), NY, before);
    expect(r.success && r.data).toMatchObject({ now: true, publish_at: null, pinned: true });
  });
  it("rejects past or too-soon schedules and missing titles", () => {
    expect(parseAnnouncementForm(form({ publish_local: "2026-09-30T09:00" }), NY, before).success).toBe(false);
    expect(parseAnnouncementForm(form({ when: "now", title: "  " }), NY, before).success).toBe(false);
    expect(parseAnnouncementForm(form({ publish_local: "" }), NY, before).success).toBe(false);
  });
});
