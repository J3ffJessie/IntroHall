import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buttonClass, Card, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/require-user";
import { SuspendButton } from "./suspend-button";

export const metadata: Metadata = { title: "Platform admin", robots: { index: false } };

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string; email?: string }> }) {
  const { q = "", email = "" } = await searchParams;
  const { supabase } = await requireUser("/admin");
  const { data: isAdmin } = await supabase.rpc("am_platform_admin");
  // Not a platform admin: the page doesn't exist for them.
  if (!isAdmin) notFound();

  const [{ data: orgs }, { data: users }] = await Promise.all([
    supabase.rpc("admin_list_orgs", { p_search: q }),
    email.trim().length >= 3 ? supabase.rpc("admin_find_users", { p_email: email }) : Promise.resolve({ data: null }),
  ]);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Platform admin</h1>

      <Card title="Organizations">
        <form className="flex gap-2" role="search" aria-label="Organizations">
          <label htmlFor="q" className="sr-only">Search organizations</label>
          <input id="q" name="q" defaultValue={q} placeholder="Name or slug" className={inputClass} />
          {email && <input type="hidden" name="email" value={email} />}
          <button type="submit" className={buttonClass.secondary}>Search</button>
        </form>
        {orgs?.length ? (
          <ul className="divide-y divide-border">
            {orgs.map((o) => (
              <li key={o.org_id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{o.name}</span>
                  <span className="ml-2 text-sm text-muted">{o.slug}</span>
                  {o.suspended_at && <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger">Suspended</span>}
                  {o.deleted_at && <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">Deleted</span>}
                  <span className="block text-sm text-muted">
                    {o.events} events · {o.members} members · owner {o.owners?.join(", ") || "none"} · created {dateFmt.format(new Date(o.created_at))}
                  </span>
                </span>
                {!o.deleted_at && <SuspendButton kind="org" id={o.org_id} name={o.name} suspended={Boolean(o.suspended_at)} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No organizations found.</p>
        )}
      </Card>

      <Card title="People">
        <form className="flex gap-2" role="search" aria-label="People">
          <label htmlFor="email" className="sr-only">Search people by email</label>
          <input id="email" name="email" defaultValue={email} placeholder="Email (at least 3 characters)" className={inputClass} />
          {q && <input type="hidden" name="q" value={q} />}
          <button type="submit" className={buttonClass.secondary}>Search</button>
        </form>
        {users === null ? null : users?.length ? (
          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li key={u.user_id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{u.email}</span>
                  {u.suspended && <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger">Suspended</span>}
                  <span className="block text-sm text-muted">
                    {u.full_name || "No name"} · {u.events} events · joined {dateFmt.format(new Date(u.created_at))}
                  </span>
                </span>
                <SuspendButton kind="user" id={u.user_id} name={u.email} suspended={u.suspended} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No one found.</p>
        )}
        <p className="text-xs text-muted">
          Unsuspending restores sign-in only. Event bans from the suspension stay until each event&apos;s organizers lift them.
        </p>
      </Card>
    </main>
  );
}
