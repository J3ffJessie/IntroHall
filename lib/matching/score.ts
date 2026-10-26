// TypeScript mirror of get_matches() scoring, for fixture tests only. SQL is the source of truth (§4.4).

/** Contribution of one shared tag held by `count` eligible attendees out of `n`. Always > 0. */
export function tagWeight(n: number, count: number | null | undefined): number {
  return Math.log(1 + Math.max(n, 1) / (count ?? 1));
}

export type Candidate = { id: string; tags: string[]; completedAt: number };

/** Ranks candidates sharing ≥ 1 tag with `mine`: score desc, then most recently completed. */
export function rankMatches(mine: string[], candidates: Candidate[], n: number, counts: Map<string, number>) {
  const my = new Set(mine);
  return candidates
    .map((c) => {
      const shared = c.tags.filter((t) => my.has(t));
      return { ...c, shared, score: shared.reduce((s, t) => s + tagWeight(n, counts.get(t)), 0) };
    })
    .filter((c) => c.shared.length > 0)
    .sort((a, b) => b.score - a.score || b.completedAt - a.completedAt);
}
