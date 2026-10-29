import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations, latestOtp, signInWithOtp } from "./helpers";
import { authUserCount, makePlatformAdmin, rebuildStats, seedAttendee, seedEvent, userIdByEmail } from "./seed";

const ROOT = "localtest.me:3000";
const run = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function organizer(page: Page, tag: string) {
  const email = `p6${tag}-${run()}@test.dev`;
  await signInWithOtp(page, email);
  return { email, id: await userIdByEmail(email) };
}

test("organizer sees analytics, merges interests, deletes and restores an event", async ({ page }) => {
  test.setTimeout(150_000);
  const { id } = await organizer(page, "org");
  const { eventId } = await seedEvent({ ownerId: id, tags: ["Rust", "JS", "JavaScript"], name: `Metrics ${run()}` });
  await seedAttendee(eventId, { name: "Ada", tags: ["Rust", "JS"] });
  await seedAttendee(eventId, { name: "Bo", tags: ["Rust", "JavaScript"] });
  await rebuildStats();

  await page.goto(`/dashboard/events/${eventId}/analytics`);
  const joined = page.locator("dl > div").filter({ hasText: "Joined" });
  await expect(joined.locator("dd").first()).toHaveText("2");
  await expect(page.getByRole("region", { name: "Top interests" }).getByRole("listitem").first()).toContainText("Rust");
  await expect(page.getByRole("img", { name: /Joins per/ })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.goto(`/dashboard/events/${eventId}/tags`);
  await page.getByLabel("Merge", { exact: true }).selectOption({ label: "JS" });
  await page.getByLabel("into").selectOption({ label: "JavaScript" });
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Merged");
  await expect(page.getByText("JS → JavaScript")).toBeVisible();
  await page.goto(`/dashboard/events/${eventId}/analytics`);
  await expect(page.getByRole("region", { name: "Top interests" })).toContainText("JavaScript2");

  await page.goto(`/dashboard/events/${eventId}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete event" }).click();
  await expect(page).toHaveURL(/\/dashboard\/orgs\//);
  const deleted = page.getByRole("region", { name: "Recently deleted" });
  await expect(deleted).toContainText("Metrics");
  await expect(page.getByRole("region", { name: "Events" })).not.toContainText("Metrics");
  await deleted.getByRole("button", { name: /Restore/ }).click();
  await expect(page.getByRole("region", { name: "Events" })).toContainText("Metrics");
});

test("attendee downloads their data and deletes their account", async ({ browser }) => {
  test.setTimeout(150_000);
  // Needs `supabase functions serve` (CI's stack runs without the edge runtime).
  const probe = await fetch("http://127.0.0.1:54321/functions/v1/delete-account", { method: "POST" }).catch(() => null);
  test.skip(!probe || probe.status === 503, "delete-account Edge Function not running (pnpm exec supabase functions serve)");

  const orgPage = await (await browser.newContext()).newPage();
  const { id } = await organizer(orgPage, "own");
  const { slug } = await seedEvent({ ownerId: id, tags: ["Rust"] });

  const page = await (await browser.newContext()).newPage();
  const email = `p6del-${run()}@test.dev`;
  await page.goto(`http://${slug}.${ROOT}/join`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.getByRole("button", { name: "Rust", exact: true }).click();
  await page.getByLabel("Name").fill("Del Etta");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "People who share your interests" })).toBeVisible();

  // The event profile links to the account page on the app host (shared sign-in cookie).
  await page.goto(`http://${slug}.${ROOT}/me`);
  await page.getByRole("link", { name: "your IntroHall account" }).click();
  await expect(page).toHaveURL(`http://app.${ROOT}/profile`);
  await expectNoSeriousA11yViolations(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download my data (JSON)" }).click(),
  ]);
  const data = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(data.email).toBe(email);
  expect(data.attendees).toHaveLength(1);
  expect(data.attendee_interests.map((i: { label: string }) => i.label)).toEqual(["Rust"]);

  await page.getByLabel("Type DELETE to confirm").fill("delete");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByRole("region", { name: "Delete account" }).getByRole("alert")).toContainText("Type DELETE");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1/);
  await expect(page.getByRole("status")).toContainText("Your account has been deleted");
  expect(await authUserCount(email)).toBe(0);

  // The sole owner is told to delete their organization first.
  await orgPage.goto("/profile");
  await expect(orgPage.getByRole("region", { name: "Delete account" })).toContainText("only owner");
  await expect(orgPage.getByRole("button", { name: "Delete my account" })).toHaveCount(0);
});

test("platform admin suspends an organization; others can't see the admin page", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const other = await (await browser.newContext()).newPage();
  const { id: ownerId } = await organizer(other, "susp");
  const { slug } = await seedEvent({ ownerId, tags: ["Rust"], name: `Suspendable ${run()}` });
  expect((await other.goto("/admin"))?.status()).toBe(404);

  const { id } = await organizer(page, "admin");
  await makePlatformAdmin(id);
  await page.goto("/admin");
  await page.getByLabel("Search organizations").fill(slug.replace(/^ev-/, "org-"));
  await page.getByRole("search", { name: "Organizations" }).getByRole("button", { name: "Search" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /^Suspend Org / }).click();
  await expect(page.getByRole("button", { name: /^Unsuspend Org / })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  const anon = await (await browser.newContext()).newPage();
  expect((await anon.goto(`http://${slug}.${ROOT}/`))?.status()).toBe(404);
  await page.getByRole("button", { name: /^Unsuspend Org / }).click();
  await expect(page.getByRole("button", { name: /^Suspend Org / })).toBeVisible();
});
