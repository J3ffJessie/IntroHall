"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { friendlyDbError } from "@/lib/db-errors";
import { fail, type FormState } from "@/lib/form-state";
import { isValidSlug } from "@/lib/hosts";

const orgSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  slug: z.string().trim().toLowerCase().refine(isValidSlug, {
    message: "Use 3–63 lowercase letters, numbers or hyphens.",
  }),
});

export async function createOrganization(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = orgSchema.safeParse({ name: form.get("name"), slug: form.get("slug") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { supabase } = await requireUser("/dashboard");
  const { data, error } = await supabase.rpc("create_organization", { p_name: parsed.data.name, p_slug: parsed.data.slug });
  if (error) return fail(friendlyDbError(error));
  redirect(`/dashboard/orgs/${data}`);
}
