import { z } from "zod";

// Mirrors the CHECK constraints on public.accounts.
export const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(100),
  headline: z.string().trim().max(140),
  company: z.string().trim().max(100),
  links: z
    .array(z.string().trim().url("Links must be full URLs").max(300))
    .max(5, "At most 5 links"),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export function parseProfileForm(form: FormData) {
  return profileSchema.safeParse({
    full_name: form.get("full_name") ?? "",
    headline: form.get("headline") ?? "",
    company: form.get("company") ?? "",
    links: String(form.get("links") ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  });
}

/** The first-run (/welcome) subset: links can be added later on /profile. */
export const welcomeSchema = profileSchema.pick({ full_name: true, headline: true, company: true });

export function parseWelcomeForm(form: FormData) {
  return welcomeSchema.safeParse({
    full_name: form.get("full_name") ?? "",
    headline: form.get("headline") ?? "",
    company: form.get("company") ?? "",
  });
}
