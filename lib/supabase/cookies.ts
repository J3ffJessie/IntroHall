import type { CookieOptionsWithName } from "@supabase/ssr";
import { cookieDomain } from "@/lib/hosts";
import { PROTOCOL, ROOT_DOMAIN } from "@/lib/env";

// Scoped to the parent domain so one sign-in covers the dashboard and every event (§4.3).
export const cookieOptions: CookieOptionsWithName = {
  domain: cookieDomain(ROOT_DOMAIN),
  path: "/",
  sameSite: "lax",
  secure: PROTOCOL === "https",
};
