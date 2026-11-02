"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { buttonClass } from "@/components/ui";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  /** Label of the confirming button, e.g. "Ban". */
  action: string;
  tone?: "danger" | "primary";
};

/**
 * Styled, accessible replacement for `window.confirm`. Render `dialog` once; `ask(…)` resolves true when the
 * person confirms and false when they cancel or dismiss.
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  // Kept after close so the text doesn't vanish during the exit animation.
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(ok: boolean) => void>(null);

  const ask = useCallback((next: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setOpts(next);
    setOpen(true);
  }), []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  };

  const dialog = (
    <AlertDialog open={open} onOpenChange={(o) => !o && settle(false)}>
      {opts && (
        <AlertDialogContent>
          <AlertDialogTitle>{opts.title}</AlertDialogTitle>
          {opts.description && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
          <div className="flex justify-end gap-2">
            <AlertDialogCancel className={buttonClass.secondary}>Cancel</AlertDialogCancel>
            <AlertDialogAction className={opts.tone === "primary" ? buttonClass.primary : buttonClass.dangerSolid}
                               onClick={() => settle(true)}>
              {opts.action}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );

  return [ask, dialog] as const;
}
