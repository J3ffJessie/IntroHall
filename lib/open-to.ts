// "Open to" intents on the event profile. Keys mirror the CHECK on attendees.open_to; order is the
// display order. Each intent may name the intent it pairs with ("Hiring" ↔ "Looking for work").

export const OPEN_TO = [
  { key: "hiring", label: "Hiring", pairs: "job_seeking" },
  { key: "job_seeking", label: "Looking for work", pairs: "hiring" },
  { key: "mentoring", label: "Mentoring others", pairs: "seeking_mentor" },
  { key: "seeking_mentor", label: "Finding a mentor", pairs: "mentoring" },
  { key: "cofounder", label: "Finding a co-founder", pairs: "cofounder" },
  { key: "investing", label: "Investing", pairs: "fundraising" },
  { key: "fundraising", label: "Raising funding", pairs: "investing" },
] as const;

export type OpenTo = (typeof OPEN_TO)[number]["key"];

const BY_KEY = new Map<string, (typeof OPEN_TO)[number]>(OPEN_TO.map((o) => [o.key, o]));

export function isOpenTo(v: unknown): v is OpenTo {
  return typeof v === "string" && BY_KEY.has(v);
}

export function openToLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

/** Valid keys only, de-duplicated, in display order (unknown values from the DB are dropped). */
export function normalizeOpenTo(values: readonly unknown[] | null | undefined): OpenTo[] {
  const set = new Set((values ?? []).filter(isOpenTo));
  return OPEN_TO.map((o) => o.key).filter((k) => set.has(k));
}

/**
 * Which of their intents pair with mine: if I'm hiring and they're looking for work, "job_seeking"
 * is a fit. Used to highlight chips on match cards; ranking is unchanged.
 */
export function complementary(mine: readonly string[], theirs: readonly string[]): OpenTo[] {
  const wanted = new Set(mine.map((k) => BY_KEY.get(k)?.pairs).filter(Boolean));
  return normalizeOpenTo(theirs).filter((k) => wanted.has(k));
}
