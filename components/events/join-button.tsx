"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export const joinButtonClass =
  "block w-full rounded-xl bg-primary px-4 py-3.5 text-center text-lg font-semibold text-primary-fg shadow-sm " +
  "transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Carries the QR's `?c=` join code to /join on the client, so the event page itself stays cacheable. */
export function JoinButton() {
  const code = useSearchParams().get("c");
  return (
    <Link href={code ? `/join?c=${encodeURIComponent(code)}` : "/join"} className={joinButtonClass}>
      Join and meet people
    </Link>
  );
}
