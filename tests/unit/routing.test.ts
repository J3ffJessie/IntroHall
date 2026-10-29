import { describe, expect, it } from "vitest";
import { decideRoute } from "@/lib/routing";

const r = (host: string, path: string) => decideRoute(host, path, "introhall.com", "https");

describe("decideRoute", () => {
  it("308s /e/{slug} on the root host to the subdomain", () => {
    expect(r("introhall.com", "/e/devconf")).toEqual({ action: "redirect", url: "https://devconf.introhall.com/", status: 308 });
    expect(r("introhall.com", "/e/devconf/matches")).toEqual({
      action: "redirect", url: "https://devconf.introhall.com/matches", status: 308,
    });
  });
  it("rewrites event hosts into /e/{slug}", () => {
    expect(r("devconf.introhall.com", "/")).toEqual({ action: "rewrite", pathname: "/e/devconf" });
    expect(r("devconf.introhall.com", "/matches")).toEqual({ action: "rewrite", pathname: "/e/devconf/matches" });
  });
  it("serves shared auth paths unchanged on event hosts", () => {
    for (const p of ["/login", "/auth/callback", "/api/x", "/legal/privacy"]) {
      expect(r("devconf.introhall.com", p)).toEqual({ action: "next" });
    }
  });
  it("does not treat look-alike paths as shared", () => {
    expect(r("devconf.introhall.com", "/loginx")).toEqual({ action: "rewrite", pathname: "/e/devconf/loginx" });
  });
  it("sends the app root to the dashboard and hides /e/ there", () => {
    expect(r("app.introhall.com", "/")).toMatchObject({ action: "redirect", url: "https://app.introhall.com/dashboard" });
    expect(r("app.introhall.com", "/e/devconf")).toEqual({ action: "notFound" });
  });
  it("sends app pages on the root host to the app host", () => {
    for (const p of ["/dashboard", "/profile/export", "/admin"]) {
      expect(r("introhall.com", p)).toEqual({ action: "redirect", url: `https://app.introhall.com${p}`, status: 307 });
    }
    expect(r("introhall.com", "/administer")).toEqual({ action: "next" });
  });
  it("404s unknown hosts", () => expect(r("evil.com", "/")).toEqual({ action: "notFound" }));
});

it("redirects localhost to the app host in local dev only", () => {
  expect(decideRoute("localhost:3000", "/login", "localtest.me:3000", "http")).toEqual({
    action: "redirect", url: "http://app.localtest.me:3000/login", status: 307,
  });
  expect(decideRoute("localhost:3000", "/", "introhall.com", "https")).toEqual({ action: "notFound" });
  // Next's internal RSC fetch (server-action redirect render) must not be redirected cross-origin.
  expect(decideRoute("localhost:3000", "/dashboard/orgs/x", "localtest.me:3000", "http", false)).toEqual({ action: "notFound" });
});
