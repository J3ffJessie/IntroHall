import { cn } from "@/lib/utils";

/**
 * Brand backdrop: two faint overlapping circles (violet + coral) centred behind the page, a Venn diagram of
 * shared interests. Fixed to the viewport and rendered once in the root layout; pages keep a transparent background.
 */
export function OverlapBackdrop() {
  return (
    <div aria-hidden
         className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]">
      <div className="size-[22rem] -translate-x-[18%] rounded-full border border-primary/15 bg-primary/[0.06] dark:border-primary/25 dark:bg-primary/[0.09] sm:size-[38rem]" />
      <div className="-ml-[22rem] size-[22rem] translate-x-[18%] rounded-full border border-highlight/20 bg-highlight/[0.06] dark:border-highlight/25 dark:bg-highlight/[0.08] sm:-ml-[38rem] sm:size-[38rem]" />
    </div>
  );
}

/** Small two-circle glyph for "in common" badges. */
export function OverlapMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 14" aria-hidden className={cn("size-4", className)}>
      <circle cx="7" cy="7" r="5.5" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="13" cy="7" r="5.5" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}
