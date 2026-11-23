import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { expectNoSeriousA11yViolations, latestOtp } from "./helpers";
import { seedAttendee, seedEvent, userIdByEmail } from "./seed";

const ROOT = "localtest.me:3000";
const db = new Pool({ connectionString: process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", max: 1 });
test.afterAll(() => db.end());

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
}

test("open to: pick intents, see them on match cards, filter Matches by them", async ({ page }) => {
  test.setTimeout(120_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const email = `opento-${run}@test.dev`;

  await page.goto(`http://app.${ROOT}/login?next=/profile`);
  await signIn(page, email);
  await expect(page).toHaveURL((u) => u.pathname === "/profile");
  const me = await userIdByEmail(email);
  const { slug, eventId } = await seedEvent({ ownerId: me, tags: ["Rust"] });
  await seedAttendee(eventId, { name: `Dana ${run}`, tags: ["Rust"] });
  await seedAttendee(eventId, { name: `Sam ${run}`, tags: ["Rust"] });
  await db.query(
    `update public.attendees a set open_to = array['job_seeking', 'mentoring'] from public.accounts ac
      where ac.user_id = a.user_id and a.event_id = $1 and ac.full_name = $2`, [eventId, `Dana ${run}`]);

  // Join and pick "Hiring" in the Open to section.
  await page.goto(`http://${slug}.${ROOT}/join`);
  await page.getByRole("button", { name: "Rust", exact: true }).click();
  await page.getByLabel("Name").fill("Hana Hiring");
  const hiring = page.getByRole("region", { name: "Open to" }).getByRole("button", { name: "Hiring" });
  await hiring.click();
  await expect(hiring).toHaveAttribute("aria-pressed", "true");
  await expectNoSeriousA11yViolations(page);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "People who share your interests" })).toBeVisible();

  // Dana's card shows her intents; "Looking for work" pairs with my "Hiring".
  const dana = page.getByRole("article").filter({ hasText: `Dana ${run}` });
  const danaOpenTo = dana.getByRole("list", { name: "Open to" });
  await expect(danaOpenTo.getByRole("listitem")).toHaveText(["Looking for work (pairs with what you're open to)", "Mentoring others"]);
  await expect(page.getByRole("article").filter({ hasText: `Sam ${run}` }).getByRole("list", { name: "Open to" })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // Filter.
  const filter = page.getByRole("navigation", { name: "Filter by what people are open to" });
  await filter.getByRole("link", { name: "Looking for work" }).click();
  await expect(page).toHaveURL(/open=job_seeking/);
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(dana).toBeVisible();
  await filter.getByRole("link", { name: "Investing" }).click();
  await expect(page.getByText("has picked “Investing” yet")).toBeVisible();
  await filter.getByRole("link", { name: "Anything" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);

  // Shown on my own profile, and editable.
  await page.goto(`http://${slug}.${ROOT}/me`);
  await expect(page.getByText("Open to: Hiring")).toBeVisible();
  await page.goto(`http://${slug}.${ROOT}/setup`);
  const region = page.getByRole("region", { name: "Open to" });
  await expect(region.getByRole("button", { name: "Hiring" })).toHaveAttribute("aria-pressed", "true");
  await region.getByRole("button", { name: "Hiring" }).click();
  await region.getByRole("button", { name: "Investing" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/home");
  const { rows: [row] } = await db.query("select open_to from public.attendees where event_id = $1 and user_id = $2", [eventId, me]);
  expect(row.open_to).toEqual(["investing"]);
  // No longer hiring, so Dana's "Looking for work" is no longer highlighted.
  await expect(danaOpenTo.getByRole("listitem")).toHaveText(["Looking for work", "Mentoring others"]);
});
