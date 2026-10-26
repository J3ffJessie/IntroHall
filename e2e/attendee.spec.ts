import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations, latestOtp } from "./helpers";
import { seedEvent, userIdByEmail } from "./seed";

const ROOT = "localtest.me:3000";
const alert = (page: Page) => page.locator('main [role="alert"]').first();

/** Signs in through the inline form on an event's /join page. */
async function signInOnJoin(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
}

async function signInOnApp(page: Page, email: string) {
  await page.goto(`http://app.${ROOT}/login?next=/profile`);
  await signInOnJoin(page, email);
  await expect(page).toHaveURL((u) => u.pathname === "/profile");
}

test("attendee joins, sets up a profile, and the organizer can ban them", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  // Organizer account (created through real sign-in) owns a seeded, published event.
  const orgCtx = await browser.newContext();
  const org = await orgCtx.newPage();
  const orgEmail = `org-${run}@test.dev`;
  await signInOnApp(org, orgEmail);
  const { slug, eventId } = await seedEvent({ ownerId: await userIdByEmail(orgEmail), tags: ["AI", "Rust", "Machine Learning"], name: `Summit ${run}` });

  // Attendee: event page → Join → sign in inline → setup.
  const attCtx = await browser.newContext();
  const att = await attCtx.newPage();
  await att.goto(`http://${slug}.${ROOT}/`);
  await att.getByRole("link", { name: "Join and meet people" }).click();
  await expect(att.getByRole("heading", { name: `Join Summit ${run}` })).toBeVisible();
  await expect(att.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
  await expectNoSeriousA11yViolations(att);
  await signInOnJoin(att, `att-${run}@test.dev`);
  await expect(att.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
  await expect(att).toHaveURL(`http://${slug}.${ROOT}/setup`);
  await expectNoSeriousA11yViolations(att);

  // Interests: two official + a custom label that normalizes onto an official tag, + a new one.
  await att.getByRole("button", { name: "AI", exact: true }).click();
  await att.getByRole("button", { name: "Rust", exact: true }).click();
  await att.getByLabel("Add your own").fill("  machine   LEARNING ");
  await att.getByRole("button", { name: "Add", exact: true }).click();
  await expect(att.getByRole("button", { name: /Machine Learning/ })).toHaveAttribute("aria-pressed", "true");
  await att.getByLabel("Add your own").fill("Espresso");
  await att.getByLabel("Add your own").press("Enter");
  await expect(att.getByText("4 of 10 selected")).toBeVisible();
  await att.getByLabel("Name").fill("Ada Attendee");
  await att.getByLabel("Short bio").fill("Secret bio text");
  await att.getByRole("button", { name: "Save and continue" }).click();

  // Saving lands on matches (empty so far); the profile page shows the saved interests.
  await expect(att.getByRole("heading", { name: "People who share your interests" })).toBeVisible();
  await expect(att.getByText("No one shares your interests yet.")).toBeVisible();
  await att.getByRole("link", { name: "My profile" }).click();
  await expect(att.getByRole("heading", { name: "My profile" })).toBeVisible();
  const chips = att.getByRole("list", { name: "Your interests" });
  for (const l of ["AI", "Espresso", "Machine Learning", "Rust"]) await expect(chips.getByText(l, { exact: true })).toBeVisible();
  await expectNoSeriousA11yViolations(att);

  // Hide / show.
  await att.getByRole("button", { name: "Hide my profile" }).click();
  await expect(att.getByText("Your profile is hidden.")).toBeVisible();
  await att.getByRole("button", { name: "Show my profile" }).click();
  await expect(att.getByText("Your profile is hidden.")).toHaveCount(0);

  // Visiting /join again while joined goes straight to matches.
  await att.goto(`http://${slug}.${ROOT}/join`);
  await expect(att).toHaveURL(`http://${slug}.${ROOT}/home`);

  // Organizer roster: name visible, bio not; then ban.
  await org.goto(`http://app.${ROOT}/dashboard/events/${eventId}/attendees`);
  await expect(org.getByText("Ada Attendee")).toBeVisible();
  await expect(org.getByText("Secret bio text")).toHaveCount(0);
  await expectNoSeriousA11yViolations(org);
  org.once("dialog", (d) => d.accept());
  await org.getByRole("button", { name: "Ban" }).click();
  await expect(org.getByText("Banned", { exact: true })).toBeVisible();

  // Banned attendee is bounced and can't rejoin.
  await att.goto(`http://${slug}.${ROOT}/home`);
  await expect(att.getByRole("heading", { name: "You can't join this event" })).toBeVisible();

  await orgCtx.close();
  await attCtx.close();
});

test("code-mode event: QR link joins directly; the plain link asks for the code", async ({ browser }) => {
  test.setTimeout(90_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const orgCtx = await browser.newContext();
  const org = await orgCtx.newPage();
  const orgEmail = `org2-${run}@test.dev`;
  await signInOnApp(org, orgEmail);
  const ownerId = await userIdByEmail(orgEmail);
  const code = "ABCDE23456";
  const coded = await seedEvent({ ownerId, tags: ["Go"], code });
  const coded2 = await seedEvent({ ownerId, tags: ["Go"], code });
  await orgCtx.close();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Scanning the QR (…/?c=CODE) → Join → sign in → straight to setup.
  await page.goto(`http://${coded.slug}.${ROOT}/?c=${code}`);
  await page.getByRole("link", { name: "Join and meet people" }).click();
  await expect(page).toHaveURL(`http://${coded.slug}.${ROOT}/join?c=${code}`);
  await signInOnJoin(page, `att2-${run}@test.dev`);
  await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();

  // Same (now signed-in) person, second event, plain link: asked for the code; wrong then right.
  await page.goto(`http://${coded2.slug}.${ROOT}/join`);
  await expect(page.getByLabel("Event code")).toBeVisible();
  await page.getByLabel("Event code").fill("WRONGCODE2");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(alert(page)).toContainText("That code didn't work");
  await page.getByLabel("Event code").fill(code.toLowerCase());
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
  await ctx.close();
});
