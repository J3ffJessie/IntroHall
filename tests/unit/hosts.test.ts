import { describe, expect, it } from "vitest";
import { cookieDomain, isValidSlug, resolveSite } from "@/lib/hosts";
import { slugify } from "@/lib/slugify";

const ROOT = "introhall.com";

describe("isValidSlug", () => {
  it.each(["devconf", "dev-conf-2026", "abc", "a".repeat(63)])("accepts %s", (s) => expect(isValidSlug(s)).toBe(true));
  it.each(["ab", "-dev", "dev-", "Dev", "dev_conf", "dev.conf", "a".repeat(64), "app", "www", "api", "admin", "cdn"])(
    "rejects %s",
    (s) => expect(isValidSlug(s)).toBe(false),
  );
});

describe("resolveSite", () => {
  it("root and www", () => {
    expect(resolveSite("introhall.com", ROOT)).toEqual({ kind: "root" });
    expect(resolveSite("www.introhall.com", ROOT)).toEqual({ kind: "root" });
  });
  it("app subdomain", () => expect(resolveSite("app.introhall.com", ROOT)).toEqual({ kind: "app" }));
  it("event subdomain, case and port insensitive", () => {
    expect(resolveSite("DevConf.introhall.com:443", ROOT)).toEqual({ kind: "event", slug: "devconf" });
    expect(resolveSite("devconf.localtest.me:3000", "localtest.me:3000")).toEqual({ kind: "event", slug: "devconf" });
  });
  it("rejects foreign, nested and reserved hosts", () => {
    expect(resolveSite("evil.com", ROOT)).toEqual({ kind: "unknown" });
    expect(resolveSite("notintrohall.com", ROOT)).toEqual({ kind: "unknown" });
    expect(resolveSite("a.b.introhall.com", ROOT)).toEqual({ kind: "unknown" });
    expect(resolveSite("api.introhall.com", ROOT)).toEqual({ kind: "unknown" });
  });
});

it("cookieDomain strips the port", () => expect(cookieDomain("localtest.me:3000")).toBe(".localtest.me"));

it("slugify makes DNS-label suggestions", () => {
  expect(slugify("  DevConf Zürich 2026! ")).toBe("devconf-zurich-2026");
  expect(slugify("a".repeat(70))).toHaveLength(63);
  expect(isValidSlug(slugify("React Summit — Amsterdam"))).toBe(true);
});
