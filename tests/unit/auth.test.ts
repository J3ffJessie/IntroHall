import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/safe-next";
import { welcomeUrl } from "@/lib/auth/require-user";
import { parseProfileForm, parseWelcomeForm } from "@/lib/profile";

describe("safeNext", () => {
  it("keeps relative paths", () => expect(safeNext("/profile?x=1")).toBe("/profile?x=1"));
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "", null, undefined])("falls back for %s", (v) =>
    expect(safeNext(v, "/fb")).toBe("/fb"),
  );
});

describe("parseProfileForm", () => {
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    Object.entries(o).forEach(([k, v]) => f.set(k, v));
    return f;
  };
  it("trims and splits links", () => {
    const res = parseProfileForm(form({ full_name: " Ada ", headline: "", company: "", links: "https://a.dev\n\n https://b.dev " }));
    expect(res.success && res.data).toEqual({ full_name: "Ada", headline: "", company: "", links: ["https://a.dev", "https://b.dev"] });
  });
  it("rejects empty name, bad URLs and >5 links", () => {
    expect(parseProfileForm(form({ full_name: "  " })).success).toBe(false);
    expect(parseProfileForm(form({ full_name: "A", links: "not a url" })).success).toBe(false);
    expect(parseProfileForm(form({ full_name: "A", links: Array(6).fill("https://a.dev").join("\n") })).success).toBe(false);
  });
});

describe("parseWelcomeForm", () => {
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    Object.entries(o).forEach(([k, v]) => f.set(k, v));
    return f;
  };
  it("needs a name; headline and company are optional", () => {
    expect(parseWelcomeForm(form({ full_name: "  Olga  " })).data).toEqual({ full_name: "Olga", headline: "", company: "" });
    expect(parseWelcomeForm(form({ full_name: "   ", company: "Acme" })).error?.issues[0].message).toBe("Name is required");
  });
  it("ignores links (added later on /profile)", () => {
    expect(parseWelcomeForm(form({ full_name: "Olga", links: "https://x.dev" })).data).not.toHaveProperty("links");
  });
});

describe("welcomeUrl", () => {
  it("encodes where to come back to", () => {
    expect(welcomeUrl("/invite/abc?x=1")).toBe("/welcome?next=%2Finvite%2Fabc%3Fx%3D1");
  });
});
