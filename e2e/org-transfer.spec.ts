import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations, latestOtp } from "./helpers";
import { seedEvent, seedMember, seedUser, userIdByEmail } from "./seed";

const ROOT = "localtest.me:3000";

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
}

test("owner transfers the organization to a teammate and stays on as admin", async ({ page }) => {
  test.setTimeout(120_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const email = `xfer-${run}@test.dev`;
  await page.goto(`http://app.${ROOT}/login?next=/profile`);
  await signIn(page, email);
  await expect(page).toHaveURL((u) => u.pathname === "/profile");
  const { orgId } = await seedEvent({ ownerId: await userIdByEmail(email), tags: ["Rust"] });
  await seedMember(orgId, await seedUser(`Tess Teammate ${run}`), "staff");

  await page.goto(`http://app.${ROOT}/dashboard/orgs/${orgId}`);
  const transfer = page.getByRole("region", { name: "Transfer ownership" });
  await expect(transfer).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Nothing chosen: a clear error, no dialog.
  await transfer.getByRole("button", { name: "Transfer ownership" }).click();
  await expect(transfer.getByRole("alert")).toHaveText("Pick who should own the organization");

  await transfer.getByLabel("New owner").selectOption({ label: `Tess Teammate ${run} (staff)` });
  await transfer.getByRole("button", { name: "Transfer ownership" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(`Make Tess Teammate ${run} the owner`);
  await dialog.getByRole("button", { name: "Transfer ownership" }).click();

  // The owner-only cards are gone; the team list shows the new roles.
  await expect(page.getByRole("region", { name: "Transfer ownership" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Delete organization" })).toHaveCount(0);
  const team = page.getByRole("region", { name: "Team" });
  await expect(team.getByRole("listitem").filter({ hasText: `Tess Teammate ${run}` })).toContainText("owner");
  await expect(team.getByRole("listitem").filter({ hasText: "(you)" })).toContainText("admin");
  // As an admin, they can still manage the team.
  await expect(team.getByLabel("Email")).toBeVisible();
});
