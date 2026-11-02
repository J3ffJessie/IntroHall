import { ArrowRight, ChatsCircle, QrCode, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { BrandMark } from "@/components/brand-mark";
import { ShimmerLink } from "@/components/magicui/shimmer-link";
import { OverlapVenn } from "@/components/overlap";
import { PROTOCOL, ROOT_DOMAIN } from "@/lib/env";

const steps = [
  { icon: QrCode, title: "Scan in", body: "Attendees join from a QR code at the door. No app store, no passwords." },
  { icon: Sparkle, title: "Find your overlap", body: "Pick a few interests and see who shares them, rarest first." },
  { icon: ChatsCircle, title: "Say hello", body: "Send a request, chat, and meet up between sessions." },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col justify-center gap-12 px-4 py-16">
      <div className="flex items-center gap-2 font-display text-lg font-semibold">
        <BrandMark />IntroHall
      </div>
      <div className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-5">
          <h1 className="text-5xl font-extrabold tracking-tight text-balance sm:text-6xl">
            Find your{" "}
            <span className="bg-gradient-to-r from-primary to-highlight bg-clip-text text-transparent">overlap.</span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Attendees scan a QR code, pick their interests, and meet the people they came to meet. The hallway track,
            without leaving it to luck.
          </p>
          <ShimmerLink href={`${PROTOCOL}://app.${ROOT_DOMAIN}/login`} className="w-fit">
            Organizer sign in <ArrowRight weight="bold" />
          </ShimmerLink>
        </div>
        <OverlapVenn you={{ name: "You", tags: ["Climate", "Design"] }}
                     them={{ name: "Priya", tags: ["Startups", "Hiring"] }}
                     shared={["Rust", "GenAI"]} />
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface/70 p-4 shadow-sm backdrop-blur">
            <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-fg">
              <Icon weight="duotone" className="size-5" />
            </span>
            <h2 className="font-semibold"><span className="text-muted-foreground">{i + 1}.</span> {title}</h2>
            <p className="text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
