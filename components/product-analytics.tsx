"use client";

import type { PostHog } from "posthog-js";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { scrubUrl } from "@/lib/monitoring";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
// Loaded on first use, so the SDK is only downloaded when analytics is configured.
let client: Promise<PostHog> | null = null;

/**
 * Anonymous page views only (PostHog). Off unless NEXT_PUBLIC_POSTHOG_KEY is set. Cookieless (no
 * cookies or storage, so no consent banner), no person profiles, no autocapture or replays, and
 * URLs scrubbed of join codes and ids. Cookieless mode must also be enabled in the PostHog project.
 */
export function ProductAnalytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (!KEY) return;
    client ??= import("posthog-js").then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
        cookieless_mode: "always",
        person_profiles: "never",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        advanced_disable_flags: true,
        capture_exceptions: false,
        before_send(event) {
          if (!event) return event;
          for (const key of Object.keys(event.properties)) {
            if (/(url|referrer)$/i.test(key) && typeof event.properties[key] === "string") {
              event.properties[key] = scrubUrl(event.properties[key]);
            }
          }
          if (typeof event.properties.$pathname === "string") event.properties.$pathname = scrubUrl(event.properties.$pathname);
          return event;
        },
      });
      return posthog;
    });
    void client.then((posthog) => posthog.capture("$pageview"));
  }, [pathname]);
  return null;
}
