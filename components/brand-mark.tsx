/** IntroHall logo: two overlapping speech bubbles, i.e. an introduction. */
export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <rect x="13" y="13" width="12.5" height="10" rx="3.5" className="fill-highlight" />
      <path d="M21.5 22.5 24 26v-4z" className="fill-highlight" />
      <rect x="6.5" y="7.5" width="13" height="10" rx="3.5" className="fill-primary-foreground stroke-primary" strokeWidth="1.5" />
      <path d="M10 17 8.5 20.5l4-3.5z" className="fill-primary-foreground" />
    </svg>
  );
}
