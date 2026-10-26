import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BannerFrame } from "@/components/events/banner-frame";
import { JoinButton, joinButtonClass } from "@/components/events/join-button";
import { getPublicEvent } from "@/lib/public-event";
import { formatEventRange } from "@/lib/time";

// ISR: organizer actions call revalidatePath(`/e/${slug}`); this is the fallback freshness.
export const revalidate = 300;

// Pages render on first request, then are cached per slug.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await getPublicEvent((await params).slug);
  if (!data) return { title: "Event not found" };
  const { event, share, banner } = data;
  const description = event.description.slice(0, 160) ||
    `${formatEventRange(event.starts_at, event.ends_at, event.timezone)}. Meet people who share your interests.`;
  // The dedicated share image wins; the banner is a reasonable fallback.
  const image = share ?? banner;
  return {
    title: { absolute: event.name },
    description,
    openGraph: {
      type: "website",
      title: event.name,
      description,
      images: image ? [{ url: image.url, alt: image.alt || event.name, ...(share ? { width: 1200, height: 630 } : {}) }] : [],
    },
    twitter: { card: image ? "summary_large_image" : "summary", title: event.name, description },
  };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicEvent(slug);
  if (!data) notFound();
  const { event, banner, share, tags } = data;
  const archived = event.status === "archived";

  return (
    <div className="min-h-dvh bg-canvas">
      {banner ? (
        // Banner area spans the same column as the content below and is sized from the image.
        <div className="mx-auto max-w-2xl px-4 pt-4 sm:pt-6">
          <BannerFrame src={banner.url} alt={banner.alt || ""} width={banner.width} height={banner.height}
                       sizes="(max-width: 672px) 100vw, 640px" priority />
        </div>
      ) : (
        <div aria-hidden className="h-28 bg-gradient-to-br from-primary-soft via-surface-muted to-canvas sm:h-36" />
      )}

      {/* Overlap only the decorative gradient; never cover part of an uploaded banner. */}
      <main className={`relative mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-10 ${banner ? "mt-4 sm:mt-6" : "-mt-8"}`}>
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-center gap-4">
            {share && (
              <Image src={share.url} alt={share.alt || ""} width={96} height={96}
                     className="size-16 shrink-0 rounded-xl border border-border object-cover sm:size-20" />
            )}
            <h1 className="text-3xl font-bold tracking-tight text-fg">{event.name}</h1>
          </div>
          <dl className="flex flex-col gap-2 text-fg">
            <div className="flex items-start gap-2">
              <dt className="sr-only">When</dt>
              <CalendarIcon />
              <dd>{formatEventRange(event.starts_at, event.ends_at, event.timezone)}</dd>
            </div>
            {event.venue && (
              <div className="flex items-start gap-2">
                <dt className="sr-only">Where</dt>
                <PinIcon />
                <dd>{event.venue}</dd>
              </div>
            )}
          </dl>
          {archived ? (
            <p className="rounded-xl bg-surface-muted px-4 py-3 text-center text-muted">This event has ended.</p>
          ) : (
            <Suspense fallback={<Link href="/join" className={joinButtonClass}>Join and meet people</Link>}>
              <JoinButton />
            </Suspense>
          )}
        </section>

        {event.description && (
          <section aria-labelledby="about" className="flex flex-col gap-2">
            <h2 id="about" className="text-lg font-semibold text-fg">About</h2>
            <p className="whitespace-pre-line text-muted">{event.description}</p>
          </section>
        )}

        {tags.length > 0 && (
          <section aria-labelledby="topics" className="flex flex-col gap-3">
            <h2 id="topics" className="text-lg font-semibold text-fg">Topics at this event</h2>
            <ul className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <li key={t} className="rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary-soft-fg">{t}</li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-4 text-sm">
          <Link href="/legal/privacy" className="text-muted underline underline-offset-2 hover:text-fg">Privacy</Link>
          <Link href="/legal/terms" className="text-muted underline underline-offset-2 hover:text-fg">Terms</Link>
          <span className="ml-auto text-muted">Powered by IntroHall</span>
        </footer>
      </main>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="mt-0.5 size-5 shrink-0 text-primary">
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8.5h14M7 3v3M13 3v3" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="mt-0.5 size-5 shrink-0 text-primary">
      <path d="M10 17s5.5-4.8 5.5-9a5.5 5.5 0 0 0-11 0c0 4.2 5.5 9 5.5 9Z" />
      <circle cx="10" cy="8" r="2" />
    </svg>
  );
}
