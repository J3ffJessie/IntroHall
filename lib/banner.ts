// How an uploaded banner fits the event page's banner area (full width of the content column).
// The area takes the image's own aspect ratio, clamped to a sensible band. Inside the band the image
// fills the area exactly (no crop, no bars). Outside it, the whole image is shown centered over a
// blurred copy of itself so the area is still filled edge to edge.

export const BANNER_MIN_RATIO = 2; // taller images (e.g. 16:9, square, portrait) are shown at 2:1
export const BANNER_MAX_RATIO = 5; // wider panoramas are shown at 5:1
const FALLBACK_RATIO = 3; // legacy uploads with no recorded size

export type BannerLayout = {
  /** CSS aspect-ratio (width / height) of the banner area. */
  ratio: number;
  /** True when the image matches the area exactly; false → contain + blurred backdrop. */
  exact: boolean;
};

export function bannerLayout(width: number | null | undefined, height: number | null | undefined): BannerLayout {
  if (!width || !height) return { ratio: FALLBACK_RATIO, exact: false };
  const natural = width / height;
  const ratio = Math.min(BANNER_MAX_RATIO, Math.max(BANNER_MIN_RATIO, natural));
  // Treat sub-1% differences as exact; rounding in the browser makes them invisible.
  return { ratio, exact: Math.abs(ratio - natural) / natural < 0.01 };
}
