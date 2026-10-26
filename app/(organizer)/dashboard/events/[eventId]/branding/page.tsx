import type { Metadata } from "next";
import { AssetUploader } from "@/components/events/asset-uploader";
import { Card } from "@/components/ui";
import { getOrgEvent } from "@/lib/org-event";
import { publicAssetUrl } from "@/lib/supabase/public";

export const metadata: Metadata = { title: "Branding" };

export default async function BrandingPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event, supabase } = await getOrgEvent(eventId);
  const { data: assets } = await supabase.from("event_assets").select("id, kind, storage_path, alt, width, height").eq("event_id", eventId);
  const find = (kind: string) => {
    const a = assets?.find((x) => x.kind === kind);
    return a ? { ...a, url: publicAssetUrl(a.storage_path) } : null;
  };
  const readOnly = event.status === "archived";

  return (
    <main className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        Event pages use a clean, accessible template that adapts to light and dark mode. Add images to make it yours.
        PNG, JPEG or WebP, up to 5 MB.
      </p>
      <Card title="Header banner">
        <AssetUploader eventId={eventId} orgId={event.org_id} kind="banner" asset={find("banner")} disabled={readOnly}
                       hint="Shown across the top of the event page, at the full width of the page content and never cropped. Images between 2:1 and 5:1 (e.g. 1600 × 400 px) fill the area exactly; other shapes are shown whole over a soft blurred fill." />
      </Card>
      <Card title="Link preview image">
        <AssetUploader eventId={eventId} orgId={event.org_id} kind="share" asset={find("share")} disabled={readOnly}
                       hint="Shown when the event link is shared in chat apps and social media (1200 × 630 px works best), and as a small square on the event page." />
      </Card>
    </main>
  );
}
