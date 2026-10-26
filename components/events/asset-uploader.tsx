"use client";

import { useRef, useState, useTransition } from "react";
import { addAsset, removeAsset } from "@/app/(organizer)/dashboard/events/[eventId]/actions";
import { BannerFrame } from "@/components/events/banner-frame";
import { buttonClass, inputClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/browser";

const ALLOWED = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
const MAX_BYTES = 5 * 1024 * 1024;
// Placeholder frames when no image is uploaded yet (recommended proportions).
const ASPECT = { banner: "aspect-[4/1]", share: "aspect-[1200/630]" };

type Kind = "banner" | "share";
type Asset = { id: string; url: string; alt: string; width: number | null; height: number | null };

/** Intrinsic size, stored so pages can reserve the image's exact aspect ratio. Null if undecodable. */
async function imageSize(file: File): Promise<{ width: number | null; height: number | null }> {
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return { width: null, height: null };
  }
}

// crypto.randomUUID needs a secure context, which http://*.localtest.me dev hosts are not.
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

export function AssetUploader({ eventId, orgId, kind, asset, hint, disabled }:
  { eventId: string; orgId: string; kind: Kind; asset: Asset | null; hint: string; disabled: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputId = `upload-${kind}`;

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a file first.");
    const ext = ALLOWED[file.type as keyof typeof ALLOWED];
    if (!ext) return setError("Only PNG, JPEG or WebP images are accepted.");
    if (file.size > MAX_BYTES) return setError("Images must be 5 MB or smaller.");
    setError(null);
    start(async () => {
      const path = `${orgId}/${eventId}/${kind}-${randomId()}.${ext}`;
      const size = await imageSize(file);
      // The bucket's own MIME/size limits reject anything that slips past the checks above.
      const { error: upErr } = await createClient().storage.from("event-assets")
        .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (upErr) return setError(upErr.message);
      const err = await addAsset(eventId, { kind, storage_path: path, alt, ...size });
      if (err) return setError(err);
      setAlt("");
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{hint}</p>
      {asset && kind === "banner" ? (
        // Exactly how the event page frames it.
        <BannerFrame src={asset.url} alt={asset.alt || "Current banner image"} width={asset.width} height={asset.height}
                     sizes="(max-width: 896px) 100vw, 860px" />
      ) : asset ? (
        // Whole image at its own proportions.
        // eslint-disable-next-line @next/next/no-img-element -- dashboard preview, no optimization needed
        <img src={asset.url} alt={asset.alt || `Current ${kind === "banner" ? "banner" : "link preview"} image`}
             className="h-auto max-h-80 w-full rounded-lg border border-border bg-surface-muted object-contain" />
      ) : (
        <div className={`${ASPECT[kind]} grid w-full place-items-center rounded-lg border border-dashed border-border-strong
                         bg-surface-muted text-sm text-muted`}>
          No image yet
        </div>
      )}
      {!disabled && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm font-medium">
            File
            <input id={inputId} ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp"
                   className="text-sm font-normal text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:font-medium file:text-primary-soft-fg" />
          </label>
          <label htmlFor={`${inputId}-alt`} className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
            Description (alt text)
            <input id={`${inputId}-alt`} value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={200}
                   className={inputClass} />
          </label>
          <button type="button" onClick={upload} disabled={pending} className={buttonClass.secondary}>
            {pending ? "Uploading…" : asset ? "Replace" : "Upload"}
          </button>
          {asset && (
            <button type="button" disabled={pending} className={buttonClass.danger}
                    onClick={() => start(() => removeAsset(eventId, asset.id))}>
              Remove
            </button>
          )}
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
