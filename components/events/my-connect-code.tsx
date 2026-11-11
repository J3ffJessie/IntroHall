"use client";

import { ArrowsClockwise, QrCode } from "@phosphor-icons/react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { rotateConnectCode } from "@/app/e/[slug]/actions";
import { useConfirm } from "@/components/confirm";
import { Button, Card } from "@/components/ui";
import { connectUrl, qrSvg } from "@/lib/qr";

/** The attendee's personal QR code: anyone at the event who scans it and confirms is connected at once. */
export function MyConnectCode({ slug, rootDomain, protocol, initialToken }:
  { slug: string; rootDomain: string; protocol: string; initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [svg, setSvg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [ask, dialog] = useConfirm();
  const url = connectUrl(slug, rootDomain, protocol, token);

  useEffect(() => {
    let cancelled = false;
    qrSvg(url).then((s) => { if (!cancelled) setSvg(s); });
    return () => { cancelled = true; };
  }, [url]);

  const reset = async () => {
    if (!await ask({
      title: "Reset your code?",
      description: "Your current code stops working, including any screenshots of it. People you're already connected with stay connected.",
      action: "Reset code",
    })) return;
    start(async () => {
      const res = await rotateConnectCode(slug);
      if (res.error || !res.token) return void toast.error(res.error);
      setToken(res.token);
      toast.success("New code ready");
    });
  };

  return (
    <Card title="Your connect code" icon={<QrCode weight="duotone" />}>
      {dialog}
      <p className="text-sm text-muted-foreground">
        Met someone in person? Let them scan this with their phone camera and you&apos;ll be connected right away,
        even if your profile is hidden from matches.
      </p>
      <div className="mx-auto w-full max-w-64 rounded-2xl bg-white p-2 ring-1 ring-border">
        {svg ? (
          // qrcode's own SVG output; nothing user-controlled is interpolated into it.
          <div role="img" aria-label="Your personal connect QR code" className="[&>svg]:h-auto [&>svg]:w-full"
               dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="aspect-square w-full animate-pulse rounded-xl bg-surface-muted" />
        )}
      </div>
      <div className="flex justify-center">
        <Button variant="secondary" disabled={pending} onClick={reset}>
          <ArrowsClockwise />Reset code
        </Button>
      </div>
    </Card>
  );
}
