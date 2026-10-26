import type { PostgrestError } from "@supabase/supabase-js";

/** Turns a Postgres/PostgREST error into a message safe to show organizers. */
export function friendlyDbError(error: PostgrestError, fallback = "Something went wrong. Please try again."): string {
  const text = `${error.message} ${error.details ?? ""}`;
  switch (error.code) {
    case "23505":
      if (text.includes("slug")) return "That address is already taken. Try another.";
      if (text.includes("normalized")) return "That tag already exists.";
      if (text.includes("event_assets_one_per_kind")) return "Remove the current image first.";
      return "That already exists.";
    case "23514":
      if (text.includes("slug cannot change")) return "The address can't change after the event is published.";
      if (text.includes("slug")) return "Addresses use 3–63 lowercase letters, numbers or hyphens, and some names are reserved.";
      if (text.includes("retention_days")) return "Message retention must be between 7 and 90 days.";
      if (text.includes("ends_at")) return "The event must end after it starts and last at most 31 days.";
      return "Some values are out of range.";
    case "42501":
      return "You don't have permission to do that.";
    case "P0001":
    case "P0002":
      // Raised by our RPCs with messages written for people.
      return error.message.charAt(0).toUpperCase() + error.message.slice(1) + ".";
    default:
      return fallback;
  }
}
