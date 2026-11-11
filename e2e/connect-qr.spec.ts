import { expect, test, type Browser, type Page } from "@playwright/test";
import { Pool } from "pg";
import { confirmDialog, expectNoSeriousA11yViolations, latestOtp } from "./helpers";
import { seedEvent, userIdByEmail } from "./seed";

const ROOT = "localtest.me:3000";
const db = new Pool({ connectionString: process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", max: 1 });
test.afterAll(() => db.end());

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
}

async function setUpProfile(page: Page, name: string) {
  await page.getByRole("button", { name: "Rust", exact: true }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Save and continue" }).click();
}

async function attendee(browser: Browser, slug: string, email: string, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`http://${slug}.${ROOT}/join`);
  await signIn(page, email);
  await setUpProfile(page, name);
  await expect(page.getByRole("heading", { name: "People who share your interests" })).toBeVisible();
  return { ctx, page };
}

/** The token behind an attendee's QR code (the image itself isn't machine-readable from the DOM). */
async function tokenOf(email: string, eventId: string): Promise<string> {
  const { rows } = await db.query(
    `select t.token from public.connect_tokens t join public.attendees a on a.id = t.attendee_id
       join auth.users u on u.id = a.user_id where u.email = $1 and a.event_id = $2`, [email, eventId]);
  return rows[0].token;
}

test("scan a personal code: sign in, join, set up, then connect in one tap", async ({ browser }) => {
  test.setTimeout(180_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  const orgEmail = `qrorg-${run}@test.dev`;
  const orgCtx = await browser.newContext();
  const org = await orgCtx.newPage();
  await org.goto(`http://app.${ROOT}/login?next=/profile`);
  await signIn(org, orgEmail);
  await expect(org).toHaveURL((u) => u.pathname === "/profile");
  const { slug, eventId } = await seedEvent({ ownerId: await userIdByEmail(orgEmail), tags: ["Rust", "AI"] });

  // Ann shows her code on her profile page.
  const annEmail = `qrann-${run}@test.dev`;
  const ann = await attendee(browser, slug, annEmail, "Ann Scanme");
  await ann.page.goto(`http://${slug}.${ROOT}/me`);
  await expect(ann.page.getByRole("img", { name: "Your personal connect QR code" })).toBeVisible();
  await expectNoSeriousA11yViolations(ann.page);
  const token = await tokenOf(annEmail, eventId);

  // Ben scans it before he has even joined: the code survives sign-in, join and setup.
  const benCtx = await browser.newContext();
  const ben = await benCtx.newPage();
  await ben.goto(`http://${slug}.${ROOT}/c/${token}`);
  await expect(ben.getByText("You scanned someone's connect code")).toBeVisible();
  await ben.getByRole("link", { name: /^Join / }).click();
  await signIn(ben, `qrben-${run}@test.dev`);
  await setUpProfile(ben, "Ben Scanner");
  await expect(ben).toHaveURL((u) => u.pathname === `/c/${token}`);
  await expect(ben.getByText("Ann Scanme")).toBeVisible();
  await expectNoSeriousA11yViolations(ben);
  await ben.getByRole("button", { name: "Connect with Ann" }).click();
  await expect(ben).toHaveURL(/\/chat\//);

  // Scanning again just offers the chat.
  await ben.goto(`http://${slug}.${ROOT}/c/${token}`);
  await expect(ben.getByText("You're already connected.")).toBeVisible();
  await expect(ben.getByRole("link", { name: "Message Ann" })).toBeVisible();

  // Ann sees Ben in her inbox without having accepted anything.
  await ann.page.goto(`http://${slug}.${ROOT}/inbox`);
  await expect(ann.page.getByText("Ben Scanner")).toBeVisible();

  // Resetting her code voids the old one.
  await ann.page.goto(`http://${slug}.${ROOT}/me`);
  await ann.page.getByRole("button", { name: "Reset code" }).click();
  await confirmDialog(ann.page, "Reset code");
  await expect(ann.page.getByText("New code ready")).toBeVisible();
  await ben.goto(`http://${slug}.${ROOT}/c/${token}`);
  await expect(ben.getByText("This code doesn't work")).toBeVisible();

  await Promise.all([orgCtx.close(), ann.ctx.close(), benCtx.close()]);
});
