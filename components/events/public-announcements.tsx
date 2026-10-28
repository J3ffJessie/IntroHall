"use client";

import { useEffect, useState } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { type Announcement, AnnouncementList, sortAnnouncements } from "./announcement-list";

/**
 * Announcements on the cached (ISR) public event page: fetched in the browser and re-polled every
 * 60 s, so scheduled posts appear without re-rendering the page (§3.1 R7).
 */
export function PublicAnnouncements({ eventId, timeZone }: { eventId: string; timeZone: string }) {
  const [items, setItems] = useState<Announcement[]>([]);
  useEffect(() => {
    const supabase = createPublicClient();
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from("announcements").select("id, title, body, pinned, published_at")
        .eq("event_id", eventId).not("published_at", "is", null);
      if (alive && data) setItems(sortAnnouncements(data).slice(0, 3));
    };
    void load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [eventId]);

  if (items.length === 0) return null;
  return (
    <section aria-labelledby="announcements" className="flex flex-col gap-3">
      <h2 id="announcements" className="text-lg font-semibold text-fg">Announcements</h2>
      <AnnouncementList items={items} timeZone={timeZone} />
    </section>
  );
}
