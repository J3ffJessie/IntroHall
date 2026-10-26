import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/events/event-form";
import { requireUser } from "@/lib/auth/require-user";
import { ROOT_DOMAIN } from "@/lib/env";
import { createEvent } from "../../actions";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { supabase } = await requireUser(`/dashboard/orgs/${orgId}/events/new`);
  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
  if (!org) notFound();

  return (
    <main className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">New event for {org.name}</h1>
      <EventForm action={createEvent.bind(null, orgId)} rootDomain={ROOT_DOMAIN} submitLabel="Create event"
                 timeZones={Intl.supportedValuesOf("timeZone")} />
    </main>
  );
}
