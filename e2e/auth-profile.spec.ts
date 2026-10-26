import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations, signInWithOtp } from "./helpers";

test("signs in by email OTP and edits the base profile", async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;

  await page.goto("/login");
  await expectNoSeriousA11yViolations(page);

  await signInWithOtp(page, email);
  await expectNoSeriousA11yViolations(page);

  await page.getByLabel("Name").fill("Ada Lovelace");
  await page.getByLabel("Headline").fill("Analytical engines");
  await page.getByLabel(/Links/).fill("https://ada.dev");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");

  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("Ada Lovelace");
  await expect(page.getByLabel("Headline")).toHaveValue("Analytical engines");
});

test("unauthenticated profile visit redirects to login", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile/);
});
