"use client";

import { CheckCircle, Info, Spinner, Warning, XCircle } from "@phosphor-icons/react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      // Sonner defaults to "Notifications", which collides with the push-settings region of that name.
      containerAriaLabel="Updates"
      icons={{
        success: <CheckCircle weight="duotone" className="size-5 text-success" />,
        info: <Info weight="duotone" className="size-5 text-primary" />,
        warning: <Warning weight="duotone" className="size-5 text-warning-fg" />,
        error: <XCircle weight="duotone" className="size-5 text-danger" />,
        loading: <Spinner className="size-5 animate-spin" />,
      }}
      style={{
        "--normal-bg": "var(--surface)",
        "--normal-text": "var(--fg)",
        "--normal-border": "var(--border)",
        "--border-radius": "var(--radius)",
      } as React.CSSProperties}
      {...props}
    />
  );
}
