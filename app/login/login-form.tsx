"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass, inputClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/browser";
import { useHydrated } from "@/lib/use-hydrated";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(error.message);
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace(next);
    router.refresh();
  }

  async function google() {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) setError(error.message);
  }

  const input = inputClass;
  const button = `${buttonClass.primary} w-full`;

  return (
    <div className="flex flex-col gap-4">
      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input id="email" type="email" required autoComplete="email" value={email}
                 onChange={(e) => setEmail(e.target.value)} className={input} />
          <button type="submit" disabled={busy || !hydrated} className={button}>Email me a code</button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <label htmlFor="code" className="text-sm font-medium">Code sent to {email}</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" required value={code}
                 onChange={(e) => setCode(e.target.value)} className={input} />
          <button type="submit" disabled={busy || !hydrated} className={button}>Verify</button>
          <button type="button" onClick={() => setStep("email")} className="text-sm text-muted underline hover:text-fg">
            Use a different email
          </button>
        </form>
      )}
      <div className="text-center text-sm text-muted">or</div>
      <button type="button" onClick={google} disabled={!hydrated} className={`${buttonClass.secondary} w-full`}>
        Continue with Google
      </button>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
