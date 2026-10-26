import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/require-user";
import { CreateOrgForm } from "./create-org-form";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { supabase } = await requireUser("/dashboard");
  const { data: orgs } = await supabase.from("organizations").select("id, name, slug").order("created_at");

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Your organizations</h1>
      {orgs && orgs.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link href={`/dashboard/orgs/${o.id}`}
                    className="block rounded-xl border border-border bg-surface p-4 font-medium shadow-sm transition-colors hover:border-primary">
                {o.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">Create an organization to start setting up events.</p>
      )}
      <Card title="New organization">
        <CreateOrgForm />
      </Card>
    </main>
  );
}
