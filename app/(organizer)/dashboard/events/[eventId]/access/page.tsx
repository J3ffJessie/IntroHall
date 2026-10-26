import type { Metadata } from "next";
import { AccessPanel } from "@/components/events/access-panel";
import { Card } from "@/components/ui";
import { PROTOCOL, ROOT_DOMAIN } from "@/lib/env";
import { getOrgEvent } from "@/lib/org-event";

export const metadata: Metadata = { title: "Access & QR" };

export default async function AccessPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event } = await getOrgEvent(eventId);
  return (
    <main>
      <Card title="Who can join">
        <AccessPanel eventId={eventId} slug={event.slug} joinMode={event.join_mode as "open" | "code"}
                     rootDomain={ROOT_DOMAIN} protocol={PROTOCOL} disabled={event.status === "archived"} />
      </Card>
    </main>
  );
}
