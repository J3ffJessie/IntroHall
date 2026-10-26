import { z } from "zod";

// Mirrors the CHECK constraints on accounts / attendees and the rules in upsert_interests().
export const MAX_INTERESTS = 10;

export const eventProfileSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(100),
  headline: z.string().trim().max(140),
  company: z.string().trim().max(100),
  bio: z.string().trim().max(500, "Bio is at most 500 characters"),
  looking_for: z.string().trim().max(280, "“Looking for” is at most 280 characters"),
  tag_ids: z.array(z.string().uuid()),
  custom: z.array(z.string().trim().min(1).max(40, "Interests are at most 40 characters")),
}).refine((v) => v.tag_ids.length + v.custom.length >= 1, { message: "Pick at least one interest" })
  .refine((v) => v.tag_ids.length + v.custom.length <= MAX_INTERESTS, { message: `Pick at most ${MAX_INTERESTS} interests` });

export function parseEventProfileForm(form: FormData) {
  return eventProfileSchema.safeParse({
    full_name: form.get("full_name") ?? "",
    headline: form.get("headline") ?? "",
    company: form.get("company") ?? "",
    bio: form.get("bio") ?? "",
    looking_for: form.get("looking_for") ?? "",
    tag_ids: form.getAll("tag_id").map(String),
    custom: form.getAll("custom").map(String).filter((s) => s.trim()),
  });
}
