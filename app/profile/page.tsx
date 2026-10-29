import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/require-user";
import { DeleteAccountForm } from "./account-controls";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const { supabase, user } = await requireUser("/profile");
  const [{ data: account }, { data: blockers }] = await Promise.all([
    supabase.from("accounts").select("full_name, headline, company, links").eq("user_id", user.id).single(),
    supabase.rpc("account_deletion_blockers"),
  ]);

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

      <Card title="Your data">
        <p className="text-sm text-muted">
          Download everything IntroHall holds about you: profile, events joined, interests, connection requests,
          messages you sent, notification devices, blocks and reports you filed.
        </p>
        {/* A plain link: the route answers with a file download. */}
        <a href="/profile/export" download className={`${buttonClass.secondary} w-fit`}>Download my data (JSON)</a>
      </Card>

      <Card title="Delete account">
        <p className="text-sm text-muted">
          Removes your profile from every event, your interests, requests, blocks and notification devices, and your
          sign-in. People you messaged keep the conversation, shown as from “Deleted user”, until the event&apos;s
          message retention ends. This can&apos;t be undone.
        </p>
        {blockers && blockers.length > 0 ? (
          <div className="flex flex-col gap-1 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-fg">
            <p>You&apos;re the only owner of {blockers.length === 1 ? "this organization" : "these organizations"}. Delete {blockers.length === 1 ? "it" : "them"} first:</p>
            <ul className="list-disc pl-5">
              {blockers.map((b) => (
                <li key={b.org_id}><Link href={`/dashboard/orgs/${b.org_id}`} className="underline">{b.name}</Link></li>
              ))}
            </ul>
          </div>
        ) : (
          <DeleteAccountForm />
        )}
      </Card>
    </main>
  );
}
