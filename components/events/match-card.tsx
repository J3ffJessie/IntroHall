import { ConnectButton, type Connection } from "./connect-button";

type Person = {
  attendee_id: string;
  full_name: string;
  headline: string;
  company: string;
  bio: string;
  looking_for: string;
  shared_tags: string[];
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

export function MatchCard({ person: p, slug, connection }: { person: Person; slug: string; connection: Connection }) {
  const role = [p.headline, p.company].filter(Boolean).join(" · ");
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft font-semibold text-primary-soft-fg">
          {initials(p.full_name)}
        </span>
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-fg">{p.full_name || "Attendee"}</h2>
          {role && <p className="truncate text-sm text-muted">{role}</p>}
        </div>
      </div>
      {p.shared_tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Shared interests">
          {p.shared_tags.map((t) => (
            <li key={t} className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-soft-fg">{t}</li>
          ))}
        </ul>
      )}
      {p.looking_for && <p className="text-sm"><span className="font-medium">Looking for:</span> {p.looking_for}</p>}
      {p.bio && <p className="line-clamp-3 text-sm text-muted">{p.bio}</p>}
      <ConnectButton slug={slug} attendeeId={p.attendee_id} name={p.full_name} connection={connection} />
    </article>
  );
}
