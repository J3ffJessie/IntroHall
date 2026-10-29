import { resolveSite } from "@/lib/hosts";

// Paths served identically on every host (auth must run on the event origin for per-origin PWAs).
const SHARED_PREFIXES = ["/login", "/auth", "/api", "/legal", "/_next"];

export type RouteDecision =
  | { action: "next" }
  | { action: "rewrite"; pathname: string }
  | { action: "redirect"; url: string; status: 307 | 308 }
  | { action: "notFound" };

/** Pure host + path → routing decision; middleware.ts applies it. */
export function decideRoute(
  host: string,
  pathname: string,
  rootDomain: string,
  protocol: string,
  /** True only for top-level browser page loads; false for Next's internal fetches (e.g. a server action rendering its redirect target). */
  isBrowserNavigation = true,
): RouteDecision {
  const site = resolveSite(host, rootDomain);
  const shared = SHARED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  switch (site.kind) {
    case "unknown":
      // Dev convenience: Next prints http://localhost:3000, which has no subdomains. Only for real page
      // loads: Next's internal fetches to localhost would follow this cross-origin redirect and lose cookies.
      if (isBrowserNavigation && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) && rootDomain.startsWith("localtest.me")) {
        return { action: "redirect", url: `${protocol}://app.${rootDomain}${pathname}`, status: 307 };
      }
      return { action: "notFound" };
    case "root": {
      const m = pathname.match(/^\/e\/([^/]+)(\/.*)?$/);
      if (m) return { action: "redirect", url: `${protocol}://${m[1]}.${rootDomain}${m[2] ?? "/"}`, status: 308 };
      if (["/dashboard", "/profile", "/admin"].some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
        return { action: "redirect", url: `${protocol}://app.${rootDomain}${pathname}`, status: 307 };
      }
      return { action: "next" };
    }
    case "app":
      if (pathname.startsWith("/e/")) return { action: "notFound" };
      if (pathname === "/") return { action: "redirect", url: `${protocol}://app.${rootDomain}/dashboard`, status: 307 };
      return { action: "next" };
    case "event":
      if (shared) return { action: "next" };
      return { action: "rewrite", pathname: `/e/${site.slug}${pathname === "/" ? "" : pathname}` };
  }
}
