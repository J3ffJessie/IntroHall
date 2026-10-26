import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const inputClass =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-base text-fg placeholder:text-muted " +
  "focus:border-primary focus:outline-2 focus:outline-primary/30";

const buttonBase = `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors
  disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
export const buttonClass = {
  primary: `${buttonBase} bg-primary text-primary-fg hover:bg-primary-hover`,
  secondary: `${buttonBase} border border-border-strong bg-surface text-fg hover:bg-surface-muted`,
  danger: `${buttonBase} border border-danger/40 bg-surface text-danger hover:bg-danger-soft`,
};

export function Button({ variant = "primary", className = "", ...props }:
  ComponentProps<"button"> & { variant?: keyof typeof buttonClass }) {
  return <button {...props} className={`${buttonClass[variant]} ${className}`} />;
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function FormMessage({ state }: { state: { ok: boolean; message: string | null } }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"}
       className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
      {state.message}
    </p>
  );
}

export function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  // Named landmark: card titles are unique within a page.
  const headingId = `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const statusStyles: Record<string, string> = {
  draft: "bg-surface-muted text-muted",
  published: "bg-success-soft text-success",
  archived: "bg-warning-soft text-warning-fg",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyles[status] ?? statusStyles.draft}`}>
      {status}
    </span>
  );
}

export function TextLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} className={`text-primary underline underline-offset-2 hover:text-primary-hover ${props.className ?? ""}`} />;
}
