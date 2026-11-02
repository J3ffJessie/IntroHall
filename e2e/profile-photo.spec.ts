import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations, latestOtp } from "./helpers";
import { seedConversation, seedEvent, userIdByEmail } from "./seed";

const ROOT = "localtest.me:3000";
// 4×3 PNG: not square, so the upload exercises the crop.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGM4YWMDRww4OQArRg8Bc3oMDAAAAABJRU5ErkJggg==", "base64");

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
}

async function attendee(browser: Browser, slug: string, email: string, name: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`http://${slug}.${ROOT}/join`);
  await signIn(page, email);
  await page.getByRole("button", { name: "Rust", exact: true }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "People who share your interests" })).toBeVisible();
  return page;
}

/** The uploaded photo is shown, and is the 512px square the browser produced. */
async function expectPhoto(scope: Locator) {
  const img = scope.locator('img[src*="/storage/v1/object/public/avatars/"]');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => `${i.naturalWidth}x${i.naturalHeight}`)).toBe("512x512");
}

test("an attendee adds a profile photo; others see it on matches and in chat", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const orgEmail = `photo-org-${run}@test.dev`;
  const annEmail = `photo-ann-${run}@test.dev`;
  const benEmail = `photo-ben-${run}@test.dev`;

  const org = await (await browser.newContext()).newPage();
  await org.goto(`http://app.${ROOT}/login?next=/profile`);
  await signIn(org, orgEmail);
  await expect(org).toHaveURL((u) => u.pathname === "/profile");
  const { slug, eventId } = await seedEvent({ ownerId: await userIdByEmail(orgEmail), tags: ["Rust"] });

  // Ann adds a photo from her event profile.
  const ann = await attendee(browser, slug, annEmail, "Ann Photo");
  await ann.goto(`http://${slug}.${ROOT}/setup`);
  const photoCard = ann.getByRole("region", { name: "Photo" });
  await photoCard.getByLabel("Add photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(photoCard.getByLabel("Change photo")).toBeVisible();
  await expectPhoto(photoCard);
  await expectNoSeriousA11yViolations(ann);

  // Ben sees it on Ann's match card and in their chat.
  const ben = await attendee(browser, slug, benEmail, "Ben Photo");
  await expectPhoto(ben.getByRole("article").filter({ hasText: "Ann Photo" }));
  const conversationId = await seedConversation(eventId, await userIdByEmail(annEmail), await userIdByEmail(benEmail));
  await ben.goto(`http://${slug}.${ROOT}/inbox`);
  await expectPhoto(ben.getByRole("link", { name: /Ann Photo/ }));
  await ben.goto(`http://${slug}.${ROOT}/chat/${conversationId}`);
  await expectPhoto(ben.getByRole("main"));

  // Removing it brings back the generated avatar.
  await photoCard.getByRole("button", { name: "Remove" }).click();
  await expect(photoCard.getByLabel("Add photo")).toBeVisible();
  await expect(photoCard.locator("img")).toHaveCount(0);
  await ben.reload();
  await expect(ben.getByRole("main").locator('img[src*="/avatars/"]')).toHaveCount(0);
});
