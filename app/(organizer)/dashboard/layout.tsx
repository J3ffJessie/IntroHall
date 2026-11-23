import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireNamedUser } from "@/lib/auth/require-user";

// Every dashboard page needs a profile with a name first (see /welcome).
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireNamedUser("/dashboard");
  return <AppShell>{children}</AppShell>;
}
