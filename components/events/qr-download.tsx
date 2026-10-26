"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";
import { qrPngDataUrl, qrSvg } from "@/lib/qr";

export function QrDownload({ url, slug }: { url: string; slug: string }) {
  const [png, setPng] = useState<string | null>(null);
  const [svgHref, setSvgHref] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    Promise.all([qrPngDataUrl(url), qrSvg(url)]).then(([p, s]) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(new Blob([s], { type: "image/svg+xml" }));
      setPng(p);
      setSvgHref(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return (
    <div className="flex flex-col items-start gap-3">
      <p className="break-all text-sm">Encodes: <code>{url}</code></p>
      {png && (
        // eslint-disable-next-line @next/next/no-img-element -- generated data URL
        <img src={png} alt={`QR code linking to ${url}`} width={192} height={192} className="rounded border border-border" />
      )}
      <div className="flex flex-wrap gap-2">
        {png && <a href={png} download={`${slug}-qr.png`} className={buttonClass.secondary}>Download PNG (1024 px)</a>}
        {svgHref && <a href={svgHref} download={`${slug}-qr.svg`} className={buttonClass.secondary}>Download SVG</a>}
      </div>
    </div>
  );
}
