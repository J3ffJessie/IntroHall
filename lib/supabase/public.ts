import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import type { Database } from "./types";

/** Cookie-less anon client for public, cacheable (ISR) pages. RLS limits it to published data. */
export function createPublicClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function publicAssetUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/event-assets/${path}`;
}
