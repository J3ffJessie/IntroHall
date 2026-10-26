import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AttendeeShell } from "@/components/events/attendee-shell";
import { EventProfileForm } from "@/components/events/event-profile-form";
import { getAttendance } from "@/lib/attendance";
import { saveEventProfile } from "../actions";

export const metadata: Metadata = { title: "Your profile", robots: { index: false } };

export default async function SetupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getAttendance(slug);
  if (!data) notFound();
  const { event, supabase, user, active } = data;
  if (!user || !active) redirect("/join");
  if (event.status !== "published") redirect("/home");

  const [{ data: account }, { data: tags }, { data: mine }] = await Promise.all([
    supabase.from("accounts").select("full_name, headline, company").eq("user_id", user.id).single(),
    supabase.from("interest_tags").select("id, label, is_official")
      .eq("event_id", event.id).eq("hidden", false).is("merged_into", null).order("label"),
    supabase.from("attendee_interests").select("tag_id").eq("attendee_id", active.id),
  ]);
  const { data: settings } = await supabase.from("events")
    .select("allow_custom_interests, max_custom_interests").eq("id", event.id).single();
  const mineIds = new Set((mine ?? []).map((m) => m.tag_id));

  return (
    <AttendeeShell eventName={event.name}>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{active.completed_at ? "Edit your profile" : "Set up your profile"}</h1>
        <p className="text-muted">This is what other attendees of {event.name} see. Your interests decide who you&apos;re matched with.</p>
      </div>
      <EventProfileForm
        action={saveEventProfile.bind(null, slug)}
        initial={{
          full_name: account?.full_name ?? "",
          headline: account?.headline ?? "",
          company: account?.company ?? "",
          bio: active.bio,
          looking_for: active.looking_for,
        }}
        // Offer official tags plus any attendee tag the user already has; selected ones first.
        tags={(tags ?? []).filter((t) => t.is_official || mineIds.has(t.id))
          .map((t) => ({ id: t.id, label: t.label, selected: mineIds.has(t.id) }))}
        allowCustom={settings?.allow_custom_interests ?? false}
        maxCustom={settings?.max_custom_interests ?? 0}
        submitLabel={active.completed_at ? "Save" : "Save and continue"}
      />
    </AttendeeShell>
  );
}
