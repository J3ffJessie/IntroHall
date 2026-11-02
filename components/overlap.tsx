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

type Person = { name: string; tags: string[] };

/** Hero illustration: two attendees as circles, their shared interests in the overlap. */
export function OverlapVenn({ you, them, shared, className }: { you: Person; them: Person; shared: string[]; className?: string }) {
  return (
    <figure className={cn("relative mx-auto aspect-[3/2] w-full max-w-md", className)}>
      <div className="absolute inset-y-0 left-0 aspect-square rounded-full border-2 border-primary/40 bg-primary/12" />
      <div className="absolute inset-y-0 right-0 aspect-square rounded-full border-2 border-highlight/50 bg-highlight/12" />
      <div className="absolute inset-y-0 left-[9%] flex w-[22%] flex-col justify-center gap-1.5">
        <p className="font-display text-sm font-semibold text-primary">{you.name}</p>
        {you.tags.map((t) => <span key={t} className="text-xs text-muted-foreground">{t}</span>)}
      </div>
      <div className="absolute inset-y-0 right-[9%] flex w-[22%] flex-col items-end justify-center gap-1.5 text-right">
        <p className="font-display text-sm font-semibold text-highlight-soft-fg">{them.name}</p>
        {them.tags.map((t) => <span key={t} className="text-xs text-muted-foreground">{t}</span>)}
      </div>
      <div className="absolute inset-y-0 left-1/2 flex -translate-x-1/2 flex-col items-center justify-center gap-1.5">
        {shared.map((t) => (
          <span key={t} className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold shadow-sm ring-1 ring-border">{t}</span>
        ))}
      </div>
      <figcaption className="sr-only">{you.name} and {them.name} share {shared.join(" and ")}.</figcaption>
    </figure>
  );
}
