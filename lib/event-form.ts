import { z } from "zod";
import { isValidSlug } from "@/lib/hosts";
import { isValidTimeZone, zonedLocalToUtc } from "@/lib/time";

const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time");

export const eventFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    slug: z.string().trim().toLowerCase().refine(isValidSlug, {
      message: "Addresses use 3–63 lowercase letters, numbers or hyphens, and some names are reserved.",
    }),
    description: z.string().trim().max(2000),
    venue: z.string().trim().max(200),
    timezone: z.string().refine(isValidTimeZone, { message: "Pick a valid time zone" }),
    starts_local: local,
    ends_local: local,
    retention_days: z.coerce.number().int().min(7, "Retention is 7–90 days").max(90, "Retention is 7–90 days"),
    allow_custom_interests: z.boolean(),
    max_custom_interests: z.coerce.number().int().min(0).max(10),
  })
  .transform((v, ctx) => {
    const starts_at = zonedLocalToUtc(v.starts_local, v.timezone);
    const ends_at = zonedLocalToUtc(v.ends_local, v.timezone);
    if (ends_at <= starts_at) {
      ctx.addIssue({ code: "custom", message: "The event must end after it starts" });
      return z.NEVER;
    }
    if (ends_at.getTime() - starts_at.getTime() > 31 * 86_400_000) {
      ctx.addIssue({ code: "custom", message: "Events can last at most 31 days" });
      return z.NEVER;
    }
    return {
      name: v.name,
      slug: v.slug,
      description: v.description,
      venue: v.venue,
      timezone: v.timezone,
      retention_days: v.retention_days,
      allow_custom_interests: v.allow_custom_interests,
      max_custom_interests: v.max_custom_interests,
      starts_at: starts_at.toISOString(),
      ends_at: ends_at.toISOString(),
    };
  });

export type EventFormValues = z.infer<typeof eventFormSchema>;

export function parseEventForm(form: FormData) {
  return eventFormSchema.safeParse({
    name: form.get("name") ?? "",
    slug: form.get("slug") ?? "",
    description: form.get("description") ?? "",
    venue: form.get("venue") ?? "",
    timezone: form.get("timezone") ?? "",
    starts_local: form.get("starts_local") ?? "",
    ends_local: form.get("ends_local") ?? "",
    retention_days: form.get("retention_days") ?? 30,
    allow_custom_interests: form.get("allow_custom_interests") === "on",
    max_custom_interests: form.get("max_custom_interests") ?? 3,
  });
}
