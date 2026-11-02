"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { setAvatar } from "@/app/profile/actions";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/browser";

const SIZE = 512;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

// crypto.randomUUID needs a secure context, which http://*.localtest.me dev hosts are not.
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Center-crops to a square and re-encodes as a 512px JPEG. Phone photos are several MB (the bucket
 * allows 2 MB), and re-encoding drops their metadata, including GPS location.
 */
async function squareJpeg(file: File): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const side = Math.min(bmp.width, bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
    bmp.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } catch {
    return null;
  }
}

export function AvatarUploader({ userId, name, path }: { userId: string; name: string; path: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(next: string | null) {
    start(async () => {
      const err = await setAvatar(next);
      if (err) return setError(err);
      router.refresh();
    });
  }

  function onPick() {
    const file = fileRef.current?.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choose an image file.");
    if (file.size > MAX_INPUT_BYTES) return setError("That image is too large. Choose one under 25 MB.");
    setError(null);
    start(async () => {
      const blob = await squareJpeg(file);
      if (!blob) return setError("We couldn't read that image. Try a JPEG or PNG.");
      const next = `${userId}/${randomId()}.jpg`;
      const { error: upErr } = await createClient().storage.from("avatars")
        .upload(next, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (upErr) return setError("Upload failed. Please try again.");
      const err = await setAvatar(next);
      if (err) return setError(err);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Avatar name={name} path={path} className="size-20 text-2xl" />
        <div className="flex flex-wrap gap-2">
          <label className={`${buttonClass.secondary} cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary
                            has-disabled:cursor-not-allowed has-disabled:opacity-50`}>
            {pending ? "Saving…" : path ? "Change photo" : "Add photo"}
            <input ref={fileRef} type="file" accept="image/*" onChange={onPick} disabled={pending} className="sr-only" />
          </label>
          {path && (
            <button type="button" disabled={pending} onClick={() => save(null)} className={buttonClass.danger}>Remove</button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Optional. Shown next to your name in matches and messages.</p>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
