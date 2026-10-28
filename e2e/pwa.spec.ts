import { expect, test, type Page } from "@playwright/test";
import { latestOtp } from "./helpers";
import { seedEvent, userIdByEmail } from "./seed";

// Service workers need a secure context: run with E2E_HTTPS=1 (pnpm dev:https + mkcert certs).
const HTTPS = process.env.E2E_HTTPS === "1";
const ROOT = "localtest.me:3000";

// The default "headless shell" always reports notifications as denied; full Chromium honors the grant.
test.use({ channel: "chromium" });

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
}

test("service worker serves visited pages offline", async ({ browser }) => {
  test.skip(!HTTPS, "needs E2E_HTTPS=1 (service workers require HTTPS)");
  test.setTimeout(150_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const orgPage = await (await browser.newContext()).newPage();
  const orgEmail = `p5sw-org-${run}@test.dev`;
  await orgPage.goto(`https://app.${ROOT}/login?next=/profile`);
  await signIn(orgPage, orgEmail);
  await expect(orgPage).toHaveURL((u) => u.pathname === "/profile");
  const { slug } = await seedEvent({ ownerId: await userIdByEmail(orgEmail), tags: ["Rust"], name: `Offline ${run}` });

  // Headless Chromium defaults notifications to "denied"; grant it like a user tapping Allow.
  const ctx = await browser.newContext({ permissions: ["notifications"] });
  const page = await ctx.newPage();
  await page.goto(`https://${slug}.${ROOT}/join`);
  await signIn(page, `p5sw-${run}@test.dev`);
  await page.getByRole("button", { name: "Rust", exact: true }).click();
  await page.getByLabel("Name").fill("Off Line");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "People who share your interests" })).toBeVisible();

  // The worker installs and takes control.
  await expect.poll(() => page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  }), { timeout: 20_000 }).toBe(true);
  // Push is available here, so the matches page offers it (subscribing itself needs a real push service).
  await expect(page.getByRole("complementary", { name: "Notifications" }).getByRole("button", { name: "Turn on notifications" })).toBeVisible();

  // Visit pages while online so they are cached.
  for (const p of ["/home", "/inbox", "/me"]) {
    await page.goto(`https://${slug}.${ROOT}${p}`);
    await page.waitForLoadState("networkidle");
  }

  await ctx.setOffline(true);
  await page.goto(`https://${slug}.${ROOT}/home`);
  await expect(page.getByRole("heading", { name: "People who share your interests" })).toBeVisible();
  await page.goto(`https://${slug}.${ROOT}/inbox`);
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await page.goto(`https://${slug}.${ROOT}/announcements`);
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await ctx.setOffline(false);
  await ctx.close();
});
