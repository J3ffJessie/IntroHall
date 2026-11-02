import { Avatar } from "@/components/avatar";
import { FadeIn } from "@/components/motion/fade-in";
import { OverlapMark } from "@/components/overlap";
import { ConnectButton, type Connection } from "./connect-button";

type Person = {
  attendee_id: string;
  full_name: string;
  headline: string;
  company: string;
  avatar_path: string | null;
  bio: string;
  looking_for: string;
  shared_tags: string[];
};

export function MatchCard({ person: p, slug, connection, index = 0 }:
  { person: Person; slug: string; connection: Connection; index?: number }) {
  const role = [p.headline, p.company].filter(Boolean).join(" · ");
  return (
    <FadeIn index={index}>
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar name={p.full_name} path={p.avatar_path} className="size-12" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-fg">{p.full_name || "Attendee"}</h2>
          {role && <p className="truncate text-sm text-muted-foreground">{role}</p>}
        </div>
        {p.shared_tags.length > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-highlight-soft px-2.5 py-1 text-xs font-semibold text-highlight-soft-fg">
            <OverlapMark className="size-3.5" />{p.shared_tags.length} in common
          </span>
        )}
      </div>
      {p.shared_tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Shared interests">
          {p.shared_tags.map((t) => (
            <li key={t} className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary-soft-fg">{t}</li>
          ))}
        </ul>
      )}
      {p.looking_for && <p className="text-sm"><span className="font-medium">Looking for:</span> {p.looking_for}</p>}
      {p.bio && <p className="line-clamp-3 text-sm text-muted-foreground">{p.bio}</p>}
      <ConnectButton slug={slug} attendeeId={p.attendee_id} name={p.full_name} connection={connection} />
    </article>
    </FadeIn>
  );
}
