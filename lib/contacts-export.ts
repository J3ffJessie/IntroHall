// Contact export: an attendee's connections at one event as vCard 3.0 (phone/Google/Outlook
// contacts) or CSV (spreadsheets, CRMs). Pure functions; the route at /e/[slug]/contacts feeds them.

export type ExportContact = {
  fullName: string;
  headline: string;
  company: string;
  links: string[];
  connectedAt: string; // ISO timestamp
  note: string | null;
  chatUrl: string | null;
};

export type ExportContext = { eventName: string; timeZone: string };

export const CONTACT_FORMATS = ["vcf", "csv"] as const;
export type ContactFormat = (typeof CONTACT_FORMATS)[number];

export function isContactFormat(v: string | null): v is ContactFormat {
  return (CONTACT_FORMATS as readonly string[]).includes(v ?? "");
}

/** "2026-11-12" in the event's time zone (when you met, as you'd remember it). */
export function localDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));
}

/** Account links come from jsonb; keep only http(s) strings. */
export function cleanLinks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((l): l is string => typeof l === "string" && /^https?:\/\//i.test(l.trim())).map((l) => l.trim());
}

// ----------------------------------------------------------------------------- vCard

/** RFC 6350 §3.4 text escaping: backslash, comma, semicolon, newline. */
export function escapeVCardText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line at 75 octets (RFC 6350 §3.2) without splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + n > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** Best-effort structured name: last word is the family name ("Ada Lovelace" → Lovelace;Ada). */
function structuredName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return `${escapeVCardText(words[0] ?? "")};;;;`;
  const family = words.pop()!;
  return `${escapeVCardText(family)};${escapeVCardText(words.join(" "))};;;`;
}

function noteText(c: ExportContact, ctx: ExportContext): string {
  const lines = [`Met at ${ctx.eventName} (connected ${localDate(c.connectedAt, ctx.timeZone)}).`];
  if (c.note) lines.push("", c.note);
  if (c.chatUrl) lines.push("", `IntroHall chat: ${c.chatUrl}`);
  return lines.join("\n");
}

export function toVCard(contacts: ExportContact[], ctx: ExportContext): string {
  const cards = contacts.map((c) => {
    const name = c.fullName.trim() || "IntroHall contact";
    const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVCardText(name)}`, `N:${structuredName(name)}`];
    if (c.company) lines.push(`ORG:${escapeVCardText(c.company)}`);
    if (c.headline) lines.push(`TITLE:${escapeVCardText(c.headline)}`);
    // URL is a URI value, not text: no escaping, but strip anything that would break the line.
    for (const url of c.links) lines.push(`URL:${url.replace(/[\r\n]/g, "")}`);
    lines.push(`NOTE:${escapeVCardText(noteText(c, ctx))}`);
    lines.push(`CATEGORIES:${escapeVCardText(ctx.eventName)}`);
    lines.push("END:VCARD");
    return lines.map(foldLine).join("\r\n");
  });
  return cards.length ? cards.join("\r\n") + "\r\n" : "";
}

// ----------------------------------------------------------------------------- CSV

export const CSV_HEADER = ["Name", "Headline", "Company", "Links", "Event", "Connected", "Note", "Chat"];

/**
 * RFC 4180 field quoting, plus spreadsheet formula-injection protection: a value starting with
 * = + - @ (or tab/CR) is prefixed with ' so Excel/Sheets treat it as text, not a formula.
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(contacts: ExportContact[], ctx: ExportContext): string {
  const rows = contacts.map((c) => [
    c.fullName, c.headline, c.company, c.links.join(" "), ctx.eventName,
    localDate(c.connectedAt, ctx.timeZone), c.note ?? "", c.chatUrl ?? "",
  ]);
  // BOM so Excel opens UTF-8 names (García, Müller) correctly.
  return "\uFEFF" + [CSV_HEADER, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

export function contactsFile(format: ContactFormat, slug: string, contacts: ExportContact[], ctx: ExportContext) {
  return format === "vcf"
    ? { body: toVCard(contacts, ctx), contentType: "text/vcard; charset=utf-8", filename: `introhall-${slug}-contacts.vcf` }
    : { body: toCsv(contacts, ctx), contentType: "text/csv; charset=utf-8", filename: `introhall-${slug}-contacts.csv` };
}
