import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass, Card, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth/require-user";
import { formatEventRange } from "@/lib/time";
import { InviteForm } from "./invite-form";
import { RemoveMemberButton, RevokeInviteButton } from "./member-buttons";

export const metadata: Metadata = { title: "Organization" };

export default async function OrgPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { supabase, user } = await requireUser(`/dashboard/orgs/${orgId}`);

  const { data: org } = await supabase.from("organizations").select("id, name").eq("id", orgId).maybeSingle();
  if (!org) notFound();

  const [{ data: events }, { data: members }, { data: invites }] = await Promise.all([
    supabase.from("events").select("id, name, slug, status, starts_at, ends_at, timezone")
      .eq("org_id", orgId).order("starts_at", { ascending: false }),
    supabase.from("org_members").select("user_id, role, accounts(full_name)").eq("org_id", orgId).order("created_at"),
    supabase.from("org_invites").select("id, email, role, expires_at")
      .eq("org_id", orgId).is("accepted_at", null).gt("expires_at", new Date().toISOString()),
  ]);

  const myRole = members?.find((m) => m.user_id === user.id)?.role;
  const isAdmin = myRole === "owner" || myRole === "admin";

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <Link href={`/dashboard/orgs/${orgId}/events/new`} className={buttonClass.primary}>New event</Link>
      </div>

      <Card title="Events">
        {events?.length ? (
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="py-3">
                <Link href={`/dashboard/events/${e.id}`} className="font-medium text-fg hover:text-primary">{e.name}</Link>
                <span className="ml-2"><StatusBadge status={e.status} /></span>
                <p className="text-sm text-muted">{formatEventRange(e.starts_at, e.ends_at, e.timezone)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No events yet.</p>
        )}
      </Card>

      <Card title="Team">
        <ul className="divide-y divide-border">
          {members?.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {m.accounts?.full_name || "Unnamed member"}
                {m.user_id === user.id && " (you)"}
                <span className="ml-2 text-sm text-muted">{m.role}</span>
              </span>
              {(isAdmin || m.user_id === user.id) && m.role !== "owner" && (
                <RemoveMemberButton orgId={orgId} userId={m.user_id} self={m.user_id === user.id} />
              )}
            </li>
          ))}
        </ul>
        {isAdmin && (
          <>
            {invites && invites.length > 0 && (
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">Pending invites</h3>
                <ul className="text-sm">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 py-1">
                      <span>{i.email} · {i.role}</span>
                      <RevokeInviteButton orgId={orgId} inviteId={i.id} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <InviteForm orgId={orgId} />
          </>
        )}
      </Card>
    </main>
  );
}
