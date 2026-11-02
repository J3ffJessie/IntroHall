import BoringAvatar from "boring-avatars";
import { avatarUrl } from "@/lib/supabase/public";

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

// Brand violets and corals: every attendee without a photo still gets a distinct, on-brand face.
const palette = ["#6d28d9", "#a78bfa", "#f97316", "#fdba74", "#f3effe"];

/**
 * Profile photo, or a generated avatar seeded by the person's name when they haven't added one.
 * Decorative: the name is always shown next to it.
 */
export function Avatar({ name, path, className = "size-11" }: { name: string; path?: string | null; className?: string }) {
  return path ? (
    // eslint-disable-next-line @next/next/no-img-element -- already a 512px square; no optimization needed
    <img src={avatarUrl(path)} alt="" loading="lazy" decoding="async"
         className={`${className} shrink-0 rounded-full bg-surface-muted object-cover`} />
  ) : (
    <span aria-hidden className={`${className} block shrink-0 overflow-hidden rounded-full [&>svg]:size-full`}>
      <BoringAvatar name={name || "?"} variant="beam" colors={palette} square />
    </span>
  );
}
