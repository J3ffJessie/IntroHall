"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { friendlyDbError } from "@/lib/db-errors";

// Authorization is enforced by the RPCs (platform_admins); these only forward the call.

export async function setOrgSuspended(orgId: string, suspended: boolean): Promise<string | null> {
  const { supabase } = await requireUser("/admin");
  const { data: slugs, error } = await supabase.rpc("admin_set_org_suspended", { p_org_id: orgId, p_suspended: suspended });
  if (error) return friendlyDbError(error);
  for (const slug of slugs ?? []) revalidatePath(`/e/${slug}`);
  revalidatePath("/admin");
  return null;
}

export async function setUserSuspended(userId: string, suspended: boolean): Promise<string | null> {
  const { supabase } = await requireUser("/admin");
  const { error } = await supabase.rpc("admin_set_user_suspended", { p_user_id: userId, p_suspended: suspended });
  if (error) return friendlyDbError(error);
  revalidatePath("/admin");
  return null;
}
