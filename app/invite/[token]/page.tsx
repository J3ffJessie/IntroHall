import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/require-user";
import { friendlyDbError } from "@/lib/db-errors";

export const metadata: Metadata = { title: "Join organization", robots: { index: false } };

async function accept(token: string) {
  "use server";
  const { supabase } = await requireUser(`/invite/${token}`);
  const { data: orgId, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error) redirect(`/invite/${token}?error=${encodeURIComponent(friendlyDbError(error))}`);
  redirect(`/dashboard/orgs/${orgId}`);
}

export default async function InvitePage({ params, searchParams }:
  { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const { user } = await requireUser(`/invite/${token}`);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">You&apos;ve been invited</h1>
      <p className="text-muted">
        Accept to join the organization as <strong>{user.email}</strong>. The invite must have been sent to this address.
      </p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <form action={accept.bind(null, token)}>
        <button type="submit" className={buttonClass.primary}>Accept invite</button>
      </form>
    </main>
  );
}
