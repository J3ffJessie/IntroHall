import type { Metadata } from "next";
import { TagManager } from "@/components/events/tag-manager";
import { Card } from "@/components/ui";
import { getOrgEvent } from "@/lib/org-event";

export const metadata: Metadata = { title: "Interests" };

export default async function TagsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event, supabase } = await getOrgEvent(eventId);
  const { data: tags } = await supabase.from("interest_tags").select("id, label, is_official, hidden")
    .eq("event_id", eventId).is("merged_into", null).order("is_official", { ascending: false }).order("label");

  return (
    <main>
      <Card title="Interests">
        <p className="text-sm text-muted">
          Attendees pick from these when they join. Hidden interests disappear from pickers and profiles.
        </p>
        <TagManager eventId={eventId} tags={tags ?? []} disabled={event.status === "archived"} />
      </Card>
    </main>
  );
}
