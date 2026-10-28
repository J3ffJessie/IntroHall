import { NextResponse, type NextRequest } from "next/server";
import { ROOT_DOMAIN } from "@/lib/env";
import { resolveSite } from "@/lib/hosts";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Event hosts go back to the event page; the app host to its sign-in page.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const toEvent = resolveSite(host, ROOT_DOMAIN).kind === "event";
  return NextResponse.redirect(new URL(toEvent ? "/" : "/login", request.url), 303);
}
