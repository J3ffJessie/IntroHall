import type { Metadata } from "next";
import { safeNext } from "@/lib/auth/safe-next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; deleted?: string }> }) {
  const { next, deleted } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      {deleted && (
        <p role="status" className="mb-4 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          Your account has been deleted.
        </p>
      )}
      <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Sign in to IntroHall</h1>
          <p className="text-sm text-muted">We&apos;ll email you a 6-digit code. No password needed.</p>
        </div>
        <LoginForm next={safeNext(next, "/dashboard")} />
      </div>
    </main>
  );
}
