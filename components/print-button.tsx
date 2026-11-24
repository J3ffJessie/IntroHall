"use client";

import { Printer } from "@phosphor-icons/react";
import { buttonClass } from "@/components/ui";

/** Opens the browser's print dialog (where "Save as PDF" also lives). */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonClass.secondary} w-fit print:hidden`}>
      <Printer aria-hidden weight="duotone" /> {label}
    </button>
  );
}
