import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AvatarUploader } from "@/components/avatar-uploader";
import { BrandMark } from "@/components/brand-mark";
import { requireUser } from "@/lib/auth/require-user";
import { safeNext } from "@/lib/auth/safe-next";
import { completeProfile } from "./actions";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Set up your profile", robots: { index: false } };

// First stop for new organizers (and invited teammates): a profile with a name before any
// organization, so the team list never shows an "Unnamed member".
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, "/dashboard");
  const { supabase, user } = await requireUser(`/welcome?next=${encodeURIComponent(next)}`);
  const { data: account } = await supabase.from("accounts")
    .select("full_name, headline, company, avatar_path").eq("user_id", user.id).maybeSingle();
  if (account?.full_name?.trim()) redirect(next);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <div className="mb-6 flex items-center justify-center gap-2 font-display text-lg font-semibold">
        <BrandMark />IntroHall
      </div>
      <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Set up your profile</h1>
          <p className="text-sm text-muted-foreground">
            One quick step before you set up an organization. You can change this any time in your profile.
          </p>
        </div>
        <AvatarUploader userId={user.id} name={account?.full_name ?? ""} path={account?.avatar_path ?? null} />
        <WelcomeForm action={completeProfile.bind(null, next)}
                     initial={{ full_name: "", headline: account?.headline ?? "", company: account?.company ?? "" }} />
      </div>
      <form action="/auth/signout" method="post" className="mt-4 text-center text-sm text-muted-foreground">
        Signed in as {user.email}.{" "}
        <button type="submit" className="text-primary underline">Not you? Sign out</button>
      </form>
    </main>
  );
}
