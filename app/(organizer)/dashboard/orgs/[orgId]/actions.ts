"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { friendlyDbError } from "@/lib/db-errors";
import { PROTOCOL, ROOT_DOMAIN } from "@/lib/env";
import { parseEventForm } from "@/lib/event-form";
import { fail, type FormState } from "@/lib/form-state";

export type InviteState = FormState & { link?: string };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["admin", "staff"]),
});

export async function createInvite(orgId: string, _prev: InviteState, form: FormData): Promise<InviteState> {
  const parsed = inviteSchema.safeParse({ email: form.get("email"), role: form.get("role") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { supabase } = await requireUser(`/dashboard/orgs/${orgId}`);
  const { data: token, error } = await supabase.rpc("create_invite", {
    p_org_id: orgId, p_email: parsed.data.email, p_role: parsed.data.role,
  });
  if (error) return fail(friendlyDbError(error));

  revalidatePath(`/dashboard/orgs/${orgId}`);
  // Pilot: organizers send the link themselves; Resend delivery comes with the email templates work.
  return { ok: true, message: `Invite created for ${parsed.data.email}. Send them this link (valid 7 days):`,
           link: `${PROTOCOL}://app.${ROOT_DOMAIN}/invite/${token}` };
}

export async function revokeInvite(orgId: string, inviteId: string): Promise<void> {
  const { supabase } = await requireUser(`/dashboard/orgs/${orgId}`);
  await supabase.from("org_invites").delete().eq("id", inviteId);
  revalidatePath(`/dashboard/orgs/${orgId}`);
}

export async function removeMember(orgId: string, userId: string): Promise<string | null> {
  const { supabase, user } = await requireUser(`/dashboard/orgs/${orgId}`);
  const { error } = await supabase.rpc("remove_org_member", { p_org_id: orgId, p_user_id: userId });
  if (error) return friendlyDbError(error);
  if (userId === user.id) redirect("/dashboard");
  revalidatePath(`/dashboard/orgs/${orgId}`);
  return null;
}

export async function createEvent(orgId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parseEventForm(form);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { supabase } = await requireUser(`/dashboard/orgs/${orgId}/events/new`);
  const { data, error } = await supabase.from("events").insert({ ...parsed.data, org_id: orgId }).select("id").single();
  if (error) return fail(friendlyDbError(error));
  redirect(`/dashboard/events/${data.id}`);
}
