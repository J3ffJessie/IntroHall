import { z } from "zod";
import { zonedLocalToUtc } from "@/lib/time";

// Scheduled times are entered in the event's time zone and stored in UTC (DST-safe via zonedLocalToUtc).
export function parseAnnouncementForm(form: FormData, timeZone: string, now = new Date()) {
  return z
    .object({
      title: z.string().trim().min(1, "Add a title").max(120),
      body: z.string().trim().max(2000),
      pinned: z.boolean(),
      when: z.enum(["now", "schedule"]),
      publish_local: z.string(),
    })
    .transform((v, ctx) => {
      let publish_at: string | null = null;
      if (v.when === "schedule") {
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.publish_local)) {
          ctx.addIssue({ code: "custom", message: "Pick a date and time" });
          return z.NEVER;
        }
        const at = zonedLocalToUtc(v.publish_local, timeZone);
        if (at.getTime() < now.getTime() + 60_000) {
          ctx.addIssue({ code: "custom", message: "Schedule at least a minute ahead, or choose “Post now”" });
          return z.NEVER;
        }
        publish_at = at.toISOString();
      }
      return { title: v.title, body: v.body, pinned: v.pinned, publish_at, now: v.when === "now" };
    })
    .safeParse({
      title: form.get("title") ?? "",
      body: form.get("body") ?? "",
      pinned: form.get("pinned") === "on",
      when: form.get("when") ?? "now",
      publish_local: form.get("publish_local") ?? "",
    });
}
