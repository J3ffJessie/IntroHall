import Image from "next/image";
import { bannerLayout } from "@/lib/banner";

type Props = {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
  /** next/image `sizes` for the column this frame sits in. */
  sizes: string;
  priority?: boolean;
};

/** The event banner area: full column width, sized from the uploaded image (see lib/banner.ts). */
export function BannerFrame({ src, alt, width, height, sizes, priority = false }: Props) {
  const { ratio, exact } = bannerLayout(width, height);
  return (
    // ring, not border: a border would shrink the inner box and crop an exact-fit image slightly.
    <div className="relative w-full overflow-hidden rounded-2xl bg-surface-muted ring-1 ring-border"
         style={{ aspectRatio: ratio }}>
      {!exact && (
        // Fills the leftover space with the image's own colors instead of empty bars.
        <Image src={src} alt="" aria-hidden fill sizes={sizes}
               className="scale-110 object-cover opacity-60 blur-2xl" />
      )}
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority}
             className={exact ? "object-cover" : "object-contain"} />
    </div>
  );
}
