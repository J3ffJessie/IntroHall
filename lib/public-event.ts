import { cache } from "react";
import { createPublicClient, publicAssetUrl } from "@/lib/supabase/public";

/** Published event by slug, as anyone may see it (anon RLS). Null → 404. */
export const getPublicEvent = cache(async (slug: string) => {
  const supabase = createPublicClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, slug, name, description, venue, starts_at, ends_at, timezone, status")
    .eq("slug", slug)
    .maybeSingle();
  if (!event) return null;
  const [{ data: assets }, { data: tags }] = await Promise.all([
    supabase.from("event_assets").select("kind, storage_path, alt, width, height").eq("event_id", event.id),
    supabase.from("interest_tags").select("label").eq("event_id", event.id).eq("is_official", true)
      .is("merged_into", null).order("label").limit(30),
  ]);
  const withUrl = (assets ?? []).map((a) => ({ ...a, url: publicAssetUrl(a.storage_path) }));
  return {
    event,
    banner: withUrl.find((a) => a.kind === "banner"),
    share: withUrl.find((a) => a.kind === "share"),
    tags: (tags ?? []).map((t) => t.label),
  };
});
