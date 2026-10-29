import { Card } from "@/components/ui";
import { type EventAnalytics, joinBuckets, percent } from "@/lib/analytics";

const fmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function StatTile({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums text-fg">{fmt.format(value)}</dd>
      {detail && <dd className="text-xs text-muted">{detail}</dd>}
    </div>
  );
}

function JoinsChart({ rows }: { rows: EventAnalytics["joins_by_hour"] }) {
  const { unit, buckets } = joinBuckets(rows);
  if (!buckets.length) return <p className="text-muted">No one has joined yet.</p>;
  const max = Math.max(...buckets.map((b) => b.joins));
  const peak = buckets.findIndex((b) => b.joins === max);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {/* Y axis: the peak value and the baseline. */}
        <div aria-hidden className="flex h-40 flex-col justify-between text-right text-xs tabular-nums text-muted">
          <span>{fmt.format(max)}</span>
          <span>0</span>
        </div>
        <div className="relative flex h-40 flex-1 items-end gap-0.5 border-b border-border"
             role="img" aria-label={`Joins per ${unit}, peaking at ${max} (${buckets[peak].label}). Table below.`}>
          {buckets.map((b) => (
            // Hover detail for pointer users; the table below carries the same values for everyone else.
            <div key={b.key} className="group relative flex h-full flex-1 items-end justify-center">
              <div className="w-full max-w-6 rounded-t-[4px] bg-chart-1 group-hover:opacity-80"
                   style={{ height: b.joins ? `max(${(b.joins / max) * 100}%, 2px)` : 0 }} />
              <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg shadow-sm group-hover:block">
                {b.label}: <span className="font-semibold tabular-nums">{b.joins}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className="ml-8 flex justify-between text-xs text-muted">
        <span>{buckets[0].label}</span>
        {buckets.length > 1 && <span>{buckets[buckets.length - 1].label}</span>}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted hover:text-fg">Show as table</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead><tr><th className="py-1 font-medium">{unit === "hour" ? "Hour" : "Day"}</th><th className="py-1 text-right font-medium">Joined</th></tr></thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.key} className="border-t border-border"><td className="py-1">{b.label}</td><td className="py-1 text-right tabular-nums">{b.joins}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function TopTags({ tags }: { tags: EventAnalytics["top_tags"] }) {
  if (!tags.length) return <p className="text-muted">No interests picked yet.</p>;
  const max = Math.max(...tags.map((t) => t.attendees));
  return (
    <ol className="flex flex-col gap-2">
      {tags.map((t) => (
        <li key={t.label} className="grid grid-cols-[minmax(6rem,10rem)_1fr] items-center gap-3 text-sm">
          <span className="truncate" title={t.label}>
            {t.label}{t.hidden && <span className="text-muted"> (hidden)</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-5 max-w-full rounded-r-[4px] bg-chart-1" style={{ width: `${(t.attendees / max) * 85}%` }} />
            <span className="tabular-nums text-muted">{t.attendees}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function AnalyticsView({ data }: { data: EventAnalytics }) {
  const completedPct = percent(data.completed, data.joined);
  const acceptedPct = percent(data.requests_accepted, data.requests_sent);
  const gone = [data.left && `${data.left} left`, data.removed && `${data.removed} removed`].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Joined" value={data.joined} detail={gone || undefined} />
        <StatTile label="Completed profiles" value={data.completed}
                  detail={completedPct === null ? undefined : `${completedPct}% of joins`} />
        <StatTile label="Requests sent" value={data.requests_sent} />
        <StatTile label="Requests accepted" value={data.requests_accepted}
                  detail={acceptedPct === null ? undefined : `${acceptedPct}% of requests`} />
        <StatTile label="Conversations started" value={data.conversations_started} />
      </dl>
      <Card title="Joins over time">
        <JoinsChart rows={data.joins_by_hour} />
      </Card>
      <Card title="Top interests">
        <p className="text-sm text-muted">Among attendees currently in the event. Individual choices are never shown.</p>
        <TopTags tags={data.top_tags} />
      </Card>
    </div>
  );
}
