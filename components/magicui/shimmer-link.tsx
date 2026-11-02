import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Primary call-to-action with a light sweep across it (Magic UI's ShimmerButton, as a link). */
export function ShimmerLink({ className, children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={cn(
        "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-primary px-5 py-3",
        "font-medium text-primary-foreground shadow-lg shadow-primary/30 transition hover:bg-primary-hover active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className,
      )}
    >
      <span aria-hidden className="absolute inset-0 animate-shimmer bg-[linear-gradient(110deg,transparent_35%,rgb(255_255_255/0.35)_50%,transparent_65%)] bg-[length:200%_100%]" />
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </Link>
  );
}
