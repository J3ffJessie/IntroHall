export type Announcement = { id: string; title: string; body: string; pinned: boolean; published_at: string | null };

/** Pinned first, then newest. */
export function sortAnnouncements<T extends Announcement>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.published_at ?? "").localeCompare(a.published_at ?? ""));
}

export function AnnouncementList({ items, timeZone }: { items: Announcement[]; timeZone: string }) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", minute: "2-digit" });
  return (
    <ul className="flex flex-col gap-3">
      {items.map((a) => (
        <li key={a.id} className={`rounded-xl border p-4 ${a.pinned ? "border-primary/40 bg-primary-soft/40" : "border-border bg-surface"}`}>
          <p className="font-semibold">{a.pinned && <span aria-label="Pinned">📌 </span>}{a.title}</p>
          {a.body && <p className="mt-1 whitespace-pre-line text-sm">{a.body}</p>}
          {a.published_at && <p className="mt-2 text-xs text-muted">{fmt.format(new Date(a.published_at))}</p>}
        </li>
      ))}
    </ul>
  );
}
