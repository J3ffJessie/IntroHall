import { defineConfig, devices } from "@playwright/test";

// *.localtest.me resolves to 127.0.0.1, which gives us real subdomains locally.
// E2E_HTTPS=1 runs against `pnpm dev:https` (mkcert), needed for service-worker/offline tests.
const HTTPS = process.env.E2E_HTTPS === "1";
const BASE = `${HTTPS ? "https" : "http"}://app.localtest.me:3000`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // Locally the Supabase containers + dev server leave little memory; parallel workers get OOM-killed.
  workers: process.env.CI ? undefined : 1,
  retries: process.env.CI ? 2 : 0,
  // Locally the dev server compiles each route on first visit, which can exceed the 5 s default.
  expect: { timeout: process.env.CI ? 5_000 : 15_000 },
  use: { baseURL: BASE, trace: "retain-on-failure", ignoreHTTPSErrors: HTTPS },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: process.env.CI ? "pnpm build && pnpm start" : HTTPS ? "pnpm dev:https" : "pnpm dev",
    ignoreHTTPSErrors: HTTPS,
    url: `${BASE}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
