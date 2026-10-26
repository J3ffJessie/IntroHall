import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/require-user";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const { supabase, user } = await requireUser("/profile");
  const { data: account } = await supabase
    .from("accounts")
    .select("full_name, headline, company, links")
    .eq("user_id", user.id)
    .single();

  return (
    <main className="flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <p className="text-sm text-muted">Signed in as {user.email}</p>
      <ProfileForm
        initial={{
          full_name: account?.full_name ?? "",
          headline: account?.headline ?? "",
          company: account?.company ?? "",
          links: Array.isArray(account?.links) ? (account.links as string[]) : [],
        }}
      />
    </main>
  );
}
