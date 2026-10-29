// Scrubbing for PostHog: URLs can carry join codes (?c=…) and ids of
// conversations or invites, none of which should leave the app.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Path without query or hash, with ids replaced by ":id" and invite tokens by ":token". */
export function scrubPath(path: string): string {
  return path.split(/[?#]/)[0].replace(UUID, ":id").replace(/^\/invite\/[^/]+/, "/invite/:token");
}

/** Absolute or relative URL → origin (if any) + scrubbed path. Unparseable input becomes "". */
export function scrubUrl(url: string): string {
  try {
    const u = new URL(url, "http://relative.invalid");
    return (u.origin === "http://relative.invalid" ? "" : u.origin) + scrubPath(u.pathname);
  } catch {
    return "";
  }
}
