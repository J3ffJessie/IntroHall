"use client";

import { HandWaving } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { connectWithCode } from "@/app/e/[slug]/actions";
import { celebrate, originOf } from "@/components/magicui/confetti";
import { Button } from "@/components/ui";
import { PENDING_CONNECT_COOKIE } from "@/lib/qr";

function setPendingCookie(value: string | null) {
  document.cookie = value
    ? `${PENDING_CONNECT_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=1800; samesite=lax`
    : `${PENDING_CONNECT_COOKIE}=; path=/; max-age=0`;
}

/** Remembers a scanned code while the scanner signs in, joins and sets up their profile. */
export function RememberConnect({ token }: { token: string }) {
  useEffect(() => setPendingCookie(token), [token]);
  return null;
}

/** One tap to connect with the code's owner; the scan itself never connects (link previews could). */
export function ConnectConfirm({ slug, token, name }: { slug: string; token: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const first = name.split(" ")[0] || "them";

  useEffect(() => setPendingCookie(null), []);

  const connect = (el: Element) => start(async () => {
    const res = await connectWithCode(slug, token);
    if (res.error || !res.conversationId) return setError(res.error ?? null);
    celebrate(originOf(el));
    toast.success(`You and ${first} are connected`);
    router.push(`/chat/${res.conversationId}`);
  });

  return (
    <div className="flex flex-col gap-2">
      <Button disabled={pending} className="w-full" onClick={(e) => connect(e.currentTarget)}>
        <HandWaving weight="duotone" />Connect with {first}
      </Button>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
