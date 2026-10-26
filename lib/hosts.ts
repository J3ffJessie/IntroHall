// Host → site resolution for `{slug}.<host>` event subdomains (plan §2, §4.2).

export const RESERVED_SLUGS = new Set([
  "app", "www", "api", "admin", "auth", "mail", "status", "docs", "help", "static", "cdn",
]);

// A DNS label: 3–63 chars, lowercase alphanumerics and hyphens, no leading/trailing hyphen.
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

export type Site =
  | { kind: "root" }
  | { kind: "app" }
  | { kind: "event"; slug: string }
  | { kind: "unknown" };

const stripPort = (host: string) => host.replace(/:\d+$/, "").toLowerCase();

/** Classifies a request Host header against the configured root domain. */
export function resolveSite(host: string, rootDomain: string): Site {
  const h = stripPort(host);
  const root = stripPort(rootDomain);
  if (h === root || h === `www.${root}`) return { kind: "root" };
  if (!h.endsWith(`.${root}`)) return { kind: "unknown" };
  const sub = h.slice(0, -(root.length + 1));
  if (sub === "app") return { kind: "app" };
  if (sub.includes(".") || !isValidSlug(sub)) return { kind: "unknown" };
  return { kind: "event", slug: sub };
}

/** Cookie domain shared by the root, `app.` and every event subdomain. */
export function cookieDomain(rootDomain: string): string {
  return `.${stripPort(rootDomain)}`;
}

export function eventUrl(slug: string, rootDomain: string, protocol = "https"): string {
  return `${protocol}://${slug}.${rootDomain}/`;
}
