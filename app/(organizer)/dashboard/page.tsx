import type { Metadata } from "next";
import { ArrowRight, Buildings } from "@phosphor-icons/react/dist/ssr";
import { Avatar } from "@/components/avatar";
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
      <h1 className="text-3xl font-bold tracking-tight">Your organizations</h1>
      {orgs && orgs.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link href={`/dashboard/orgs/${o.id}`}
                    className="group flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 font-medium shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                <Avatar name={o.name} className="size-10" />
                <span className="flex-1">{o.name}</span>
                <ArrowRight aria-hidden className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Create an organization to start setting up events.</p>
      )}
      <Card title="New organization" icon={<Buildings weight="duotone" />}>
        <CreateOrgForm />
      </Card>
    </main>
  );
}
