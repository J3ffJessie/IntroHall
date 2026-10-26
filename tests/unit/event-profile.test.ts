import { describe, expect, it } from "vitest";
import { parseEventProfileForm } from "@/lib/event-profile";

const form = (entries: [string, string][]) => {
  const f = new FormData();
  entries.forEach(([k, v]) => f.append(k, v));
  return f;
};
const base: [string, string][] = [["full_name", "Ada"], ["headline", ""], ["company", ""], ["bio", ""], ["looking_for", ""]];
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("parseEventProfileForm", () => {
  it("collects tag ids and custom labels", () => {
    const res = parseEventProfileForm(form([...base, ["tag_id", uuid(1)], ["custom", " Coffee "], ["custom", "  "]]));
    expect(res.success && res.data).toMatchObject({ tag_ids: [uuid(1)], custom: ["Coffee"] });
  });
  it("needs 1–10 interests", () => {
    expect(parseEventProfileForm(form(base)).error?.issues[0].message).toMatch(/at least one/);
    const eleven = Array.from({ length: 11 }, (_, i) => ["tag_id", uuid(i)] as [string, string]);
    expect(parseEventProfileForm(form([...base, ...eleven])).error?.issues[0].message).toMatch(/at most 10/);
  });
  it("rejects a missing name and long fields", () => {
    expect(parseEventProfileForm(form([["full_name", " "], ["tag_id", uuid(1)]])).success).toBe(false);
    expect(parseEventProfileForm(form([...base, ["tag_id", uuid(1)], ["custom", "x".repeat(41)]])).success).toBe(false);
  });
});
