import { devices, expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations, latestOtp } from "./helpers";
import { seedAttendee, seedEvent, userIdByEmail } from "./seed";

const HTTPS = process.env.E2E_HTTPS === "1";
const PROTO = HTTPS ? "https" : "http";
const ROOT = "localtest.me:3000";

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
}

async function joinAs(page: Page, slug: string, email: string, name: string) {
  await page.goto(`${PROTO}://${slug}.${ROOT}/join`);
  await signIn(page, email);
  await page.getByRole("button", { name: "Rust", exact: true }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "People who share your interests" })).toBeVisible();
}

test("organizer posts a pinned announcement; attendees see it live and on the public page", async ({ browser }) => {
  test.setTimeout(150_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const org = await (await browser.newContext()).newPage();
  const orgEmail = `p5org-${run}@test.dev`;
  await org.goto(`${PROTO}://app.${ROOT}/login?next=/profile`);
  await signIn(org, orgEmail);
  await expect(org).toHaveURL((u) => u.pathname === "/profile");
  const { slug, eventId } = await seedEvent({ ownerId: await userIdByEmail(orgEmail), tags: ["Rust"], name: `Summit ${run}` });

  const att = await (await browser.newContext()).newPage();
  await joinAs(att, slug, `p5att-${run}@test.dev`, "Ann Listener");
  await expect(att.getByRole("region", { name: "Announcements" })).toHaveCount(0);

  // Post now, pinned.
  await org.goto(`${PROTO}://app.${ROOT}/dashboard/events/${eventId}/announcements`);
  await expectNoSeriousA11yViolations(org);
  await org.getByLabel("Title").fill("Keynote moved to Hall B");
  await org.getByLabel("Message (optional)").fill("Starts at 10:15.");
  await org.getByLabel("Pin to the top of the feed").check();
  await org.getByRole("button", { name: "Post announcement" }).click();
  await expect(org.getByRole("status")).toContainText("Posted");
  await expect(org.getByRole("region", { name: /Posted/ }).getByText("Keynote moved to Hall B")).toBeVisible();

  // The attendee's matches page updates live (realtime broadcast on event:{id}).
  const feed = att.getByRole("region", { name: "Announcements" });
  await expect(feed.getByText("Keynote moved to Hall B")).toBeVisible({ timeout: 10_000 });
  await expect(feed.getByLabel("Pinned")).toBeVisible();
  await expectNoSeriousA11yViolations(att);

  // A scheduled post is listed for the organizer but not shown to attendees yet.
  await org.getByLabel("Title").fill("Lunch at noon");
  await org.getByText("Schedule", { exact: true }).click();
  await org.getByLabel("Post at").fill("2099-01-01T12:00");
  await org.getByRole("button", { name: "Schedule" }).click();
  await expect(org.getByRole("region", { name: /Scheduled/ }).getByText("Lunch at noon")).toBeVisible();

  // Public event page (anonymous) shows posted announcements, not scheduled ones.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${PROTO}://${slug}.${ROOT}/`);
  const pub = anon.getByRole("region", { name: "Announcements" });
  await expect(pub.getByText("Keynote moved to Hall B")).toBeVisible();
  await expect(anon.getByText("Lunch at noon")).toHaveCount(0);

  // Per-event web app manifest.
  const manifest = await anon.request.get(`${PROTO}://${slug}.${ROOT}/manifest.webmanifest`);
  expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
  expect(await manifest.json()).toMatchObject({ name: `Summit ${run}`, start_url: "/home", display: "standalone" });
  const sw = await anon.request.get(`${PROTO}://${slug}.${ROOT}/sw.js`);
  expect(sw.ok()).toBe(true);
});

test("iPhone users get Add to Home Screen instructions for notifications", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const { slug, eventId } = await seedEvent({ ownerId: await (async () => {
    const p = await (await browser.newContext()).newPage();
    const email = `p5ios-org-${run}@test.dev`;
    await p.goto(`${PROTO}://app.${ROOT}/login?next=/profile`);
    await signIn(p, email);
    await expect(p).toHaveURL((u) => u.pathname === "/profile");
    return userIdByEmail(email);
  })(), tags: ["Rust"] });
  await seedAttendee(eventId, { name: "Someone", tags: ["Rust"] });

  const page = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
  await joinAs(page, slug, `p5ios-${run}@test.dev`, "Ivy Phone");
  await expect(page.getByRole("complementary", { name: "Notifications" }).getByText("Add to Home Screen")).toBeVisible();
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" }).getByText("Add to Home Screen")).toBeVisible();
});
