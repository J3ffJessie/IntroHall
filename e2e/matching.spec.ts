import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations, latestOtp } from "./helpers";
import { rebuildStats, seedAttendee, seedEvent, userIdByEmail } from "./seed";

const ROOT = "localtest.me:3000";

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
}

test("matches are ranked by rarer shared interests, filterable, with an Everyone tab", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  const orgCtx = await browser.newContext();
  const org = await orgCtx.newPage();
  const orgEmail = `morg-${run}@test.dev`;
  await org.goto(`http://app.${ROOT}/login?next=/profile`);
  await signIn(org, orgEmail);
  await expect(org).toHaveURL((u) => u.pathname === "/profile");
  const { slug, eventId } = await seedEvent({ ownerId: await userIdByEmail(orgEmail), tags: ["Rust", "AI", "Knitting"] });
  await orgCtx.close();

  // "AI" is common (6 holders), "Rust" is rare (2 holders incl. me).
  await seedAttendee(eventId, { name: "Rhea Rust", headline: "Compiler engineer", tags: ["Rust"], lookingFor: "Rust contributors" });
  for (let i = 1; i <= 5; i++) await seedAttendee(eventId, { name: `Al ${i}`, tags: ["AI"] });
  await seedAttendee(eventId, { name: "Kit Knitter", tags: ["Knitting"] });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`http://${slug}.${ROOT}/join`);
  await signIn(page, `mme-${run}@test.dev`);
  await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
  await page.getByRole("button", { name: "Rust", exact: true }).click();
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await page.getByLabel("Name").fill("Me Tester");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "People who share your interests" })).toBeVisible();

  await rebuildStats();
  await page.reload();
  const list = page.getByRole("list", { name: "Matches" });
  const names = list.getByRole("heading", { level: 2 });
  await expect(names).toHaveCount(6);
  await expect(names.first()).toHaveText("Rhea Rust");
  const first = list.getByRole("listitem").first();
  await expect(first.getByText("Compiler engineer")).toBeVisible();
  await expect(first.getByRole("list", { name: "Shared interests" })).toHaveText("Rust");
  await expect(first.getByText("Rust contributors")).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Filter by AI.
  await page.getByRole("navigation", { name: "Filter by interest" }).getByRole("link", { name: /^AI/ }).click();
  await expect(names).toHaveCount(5);
  await expect(page).toHaveURL(/tag=/);

  // Everyone tab: the person with no shared interests.
  await page.getByRole("link", { name: "Everyone" }).click();
  await expect(page).toHaveURL(/tab=everyone/);
  // Everyone keeps the AI filter: nobody holding AI is outside my matches.
  await expect(page.getByText("No one here yet.")).toBeVisible();
  await page.getByRole("navigation", { name: "Filter by interest" }).getByRole("link", { name: "All" }).click();
  await expect(page).toHaveURL((u) => u.search === "?tab=everyone");
  await expect(page.getByRole("list", { name: "Everyone" }).getByRole("heading", { level: 2 })).toHaveText(["Kit Knitter"]);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoSeriousA11yViolations(page);
  await ctx.close();
});
