import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PROTOCOL, ROOT_DOMAIN, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { decideRoute } from "@/lib/routing";
import { cookieOptions } from "@/lib/supabase/cookies";

export async function middleware(request: NextRequest) {
  // Prefer the forwarded host: Vercel's proxy sets it, and Next's own internal fetches (a server action
  // rendering its redirect target) arrive as Host: localhost with the real host here. It only picks
  // which public route renders; authorization still comes from the session and RLS.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  // Browsers mark top-level page loads; Next's internal server-side fetches never carry this header.
  const isBrowserNavigation = request.headers.get("sec-fetch-dest") === "document";
  const decision = decideRoute(host, request.nextUrl.pathname, ROOT_DOMAIN, PROTOCOL, isBrowserNavigation);

  if (decision.action === "notFound") return new NextResponse("Not found", { status: 404 });
  if (decision.action === "redirect") {
    return NextResponse.redirect(decision.url + request.nextUrl.search, decision.status);
  }

  let response =
    decision.action === "rewrite"
      ? NextResponse.rewrite(new URL(decision.pathname + request.nextUrl.search, request.url))
      : NextResponse.next({ request });

  // Refresh the Supabase session and propagate rotated cookies.
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response =
          decision.action === "rewrite"
            ? NextResponse.rewrite(new URL(decision.pathname + request.nextUrl.search, request.url), { request })
            : NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // manifest.webmanifest is NOT excluded: on event hosts it rewrites to the per-event manifest route.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)"],
};
