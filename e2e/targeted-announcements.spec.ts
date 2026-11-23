import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations, latestOtp } from "./helpers";
import { seedEvent, userIdByEmail } from "./seed";

const ROOT = "localtest.me:3000";

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
}

test("organizer posts to an interest; only attendees with it see the post", async ({ browser }) => {
  test.setTimeout(150_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const org = await (await browser.newContext()).newPage();
  const orgEmail = `tgtorg-${run}@test.dev`;
  await org.goto(`http://app.${ROOT}/login?next=/profile`);
  await signIn(org, orgEmail);
  await expect(org).toHaveURL((u) => u.pathname === "/profile");
  const { slug, eventId } = await seedEvent({ ownerId: await userIdByEmail(orgEmail), tags: ["Rust", "Go"] });

  // The attendee picks Rust only.
  const att = await (await browser.newContext()).newPage();
  await att.goto(`http://${slug}.${ROOT}/join`);
  await signIn(att, `tgtatt-${run}@test.dev`);
  await att.getByRole("button", { name: "Rust", exact: true }).click();
  await att.getByLabel("Name").fill("Rae Rust");
  await att.getByRole("button", { name: "Save and continue" }).click();
  await expect(att.getByRole("heading", { name: "People who share your interests" })).toBeVisible();

  // The composer offers each interest with how many attendees it reaches.
  await org.goto(`http://app.${ROOT}/dashboard/events/${eventId}/announcements`);
  const audience = org.getByLabel("Who should see this?");
  await expect(audience.locator("option")).toHaveText([
    "Everyone at the event", "Interested in Rust (1 attendee)", "Interested in Go (0 attendees)",
  ]);
  await expectNoSeriousA11yViolations(org);

  await org.getByLabel("Title").fill("Rust meetup at 3");
  await audience.selectOption({ label: "Interested in Rust (1 attendee)" });
  await org.getByRole("button", { name: "Post announcement" }).click();
  await expect(org.getByRole("status")).toContainText("Attendees with that interest");
  await expect(audience).toHaveValue("");

  await org.getByLabel("Title").fill("Go meetup at 4");
  await audience.selectOption({ label: "Interested in Go (0 attendees)" });
  await org.getByRole("button", { name: "Post announcement" }).click();
  const posted = org.getByRole("region", { name: /Posted/ });
  await expect(posted.getByText("Go meetup at 4")).toBeVisible();
  await expect(posted.getByText("To attendees interested in Go")).toBeVisible();
  await expect(posted.getByText("To attendees interested in Rust")).toBeVisible();

  // The attendee sees the Rust post, labelled, and not the Go one.
  await att.reload();
  const feed = att.getByRole("region", { name: "Announcements" });
  await expect(feed.getByText("Rust meetup at 3")).toBeVisible();
  await expect(feed.getByText("For people interested in Rust")).toBeVisible();
  await expect(att.getByText("Go meetup at 4")).toHaveCount(0);
  await expectNoSeriousA11yViolations(att);

  // Targeted posts stay off the public event page.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`http://${slug}.${ROOT}/`);
  await expect(anon.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(anon.getByText("Rust meetup at 3")).toHaveCount(0);
  await expect(anon.getByText("Go meetup at 4")).toHaveCount(0);
});
