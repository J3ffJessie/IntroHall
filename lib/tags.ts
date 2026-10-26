/** Display form of a tag label; mirrors the DB trigger (NFKC, trim, collapse whitespace). */
export function normalizeTagLabel(label: string): string {
  return label.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/** Uniqueness key; mirrors private.normalize_tag (display form, lowercased). */
export function tagKey(label: string): string {
  return normalizeTagLabel(label).toLowerCase();
}
