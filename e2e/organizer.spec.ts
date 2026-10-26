import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { expectNoSeriousA11yViolations, latestOtp, signInWithOtp } from "./helpers";

const ROOT = "localtest.me:3000";

// Form errors only; Next's route announcer is also role="alert" but sits outside <main>.
const alert = (page: Page) => page.locator('main [role="alert"]').first();

function png(width = 4, height = 4): Buffer {
  const img = new PNG({ width, height });
  img.data.fill(200);
  return PNG.sync.write(img);
}

test("organizer creates, brands, publishes an event and gets a QR code", async ({ page, browser }) => {
  // Long journey; on a cold dev server each page compiles on first visit.
  test.setTimeout(90_000);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const slug = `conf-${id}`;
  await signInWithOtp(page, `org-${id}@test.dev`);

  // Organization
  await page.goto("/dashboard");
  await page.getByLabel("Organization name").fill(`Org ${id}`);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("heading", { name: `Org ${id}` })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Event (reserved slug first)
  await page.getByRole("link", { name: "New event" }).click();
  await page.getByLabel("Event name").fill(`Conf ${id}`);
  await page.getByLabel("Event address").fill("app");
  await page.getByLabel("Time zone").selectOption("America/New_York");
  await page.getByLabel("Starts").fill("2026-11-03T09:00");
  await page.getByLabel("Ends").fill("2026-11-04T18:00");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(alert(page)).toContainText("reserved");
  await page.getByLabel("Event address").fill(slug);
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("heading", { name: `Conf ${id}` })).toBeVisible();
  await expect(page.getByText("Tue, Nov 3, 9:00 AM – Wed, Nov 4, 6:00 PM EST")).toBeVisible();

  // Interests
  await page.getByRole("link", { name: "Interests" }).click();
  for (const label of ["AI", "Rust", "Design"]) {
    await page.getByLabel("Add an interest").fill(label);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(label);
  }
  await page.getByLabel("Add an interest").fill("  rust ");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(alert(page)).toContainText("already exists");

  // Branding: fixed template, so no color pickers; SVG rejected; banner + share image accepted
  await page.getByRole("link", { name: "Branding" }).click();
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  const banner = page.getByRole("region", { name: "Header banner" });
  await banner.getByLabel("File").setInputFiles({ name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await banner.getByRole("button", { name: "Upload" }).click();
  await expect(alert(page)).toContainText("Only PNG, JPEG or WebP");
  await banner.getByLabel("File").setInputFiles({ name: "banner.png", mimeType: "image/png", buffer: png(1200, 300) });
  await banner.getByLabel("Description (alt text)").fill("Conf banner");
  await banner.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("img", { name: "Conf banner" })).toBeVisible();
  const share = page.getByRole("region", { name: "Link preview image" });
  await share.getByLabel("File").setInputFiles({ name: "share.png", mimeType: "image/png", buffer: png(120, 63) });
  await share.getByLabel("Description (alt text)").fill("Conf preview");
  await share.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("img", { name: "Conf preview" })).toBeVisible();

  // Publish; slug then locked
  await page.getByRole("link", { name: "Overview" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("published", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Details" }).click();
  await expect(page.getByLabel("Event address")).toHaveAttribute("readonly", "");

  // QR (open mode)
  await page.getByRole("link", { name: "Access & QR" }).click();
  await expect(page.getByText(`Encodes: http://${slug}.${ROOT}/`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PNG (1024 px)" })).toBeVisible();


  // Public page, anonymous
  const anonContext = await browser.newContext();
  const anon = await anonContext.newPage();
  await anon.goto(`http://${slug}.${ROOT}/`);
  await expect(anon.getByRole("heading", { name: `Conf ${id}` })).toBeVisible();
  await expect(anon.getByRole("link", { name: "Privacy" })).toBeVisible();
  await expect(anon.getByRole("listitem").filter({ hasText: "Rust" })).toBeVisible();
  // Whole banner, uncropped: the banner area takes the uploaded 4:1 proportions
  // and spans exactly the width of the event card below it.
  const bannerImg = anon.getByRole("img", { name: "Conf banner" });
  await expect(bannerImg).toBeVisible();
  const box = (await bannerImg.boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(4, 1);
  const card = (await anon.getByRole("heading", { level: 1 }).locator("xpath=ancestor::section[1]").boundingBox())!;
  expect(Math.abs(box.x - card.x)).toBeLessThan(2);
  expect(Math.abs(box.width - card.width)).toBeLessThan(2);
  // Link preview image as a square in the details card.
  const thumb = anon.getByRole("img", { name: "Conf preview" });
  await expect(thumb).toBeVisible();
  const t = (await thumb.boundingBox())!;
  expect(t.width).toBeCloseTo(t.height, 0);
  await expect(anon.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/event-assets\/.+\/share-/);
  await expect(anon.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expectNoSeriousA11yViolations(anon);
  await anon.emulateMedia({ colorScheme: "dark" });
  await expectNoSeriousA11yViolations(anon);
  await anonContext.close();

  // Dashboard is readable in dark mode too
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/dashboard");
  await expectNoSeriousA11yViolations(page);
});

test("root /e/{slug} redirects to the subdomain; unknown subdomain 404s", async ({ request }) => {
  const res = await request.get(`http://${ROOT}/e/some-event`, { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers().location).toBe(`http://some-event.${ROOT}/`);

  const missing = await request.get(`http://no-such-event-zz.${ROOT}/`);
  expect(missing.status()).toBe(404);
});

test("signing in from /login lands on the dashboard", async ({ page }) => {
  const email = `land-${Date.now()}@test.dev`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/dashboard");
  await expect(page.getByRole("heading", { name: "Your organizations" })).toBeVisible();
});

test("a session from app.<host> is sent to event subdomains", async ({ page }) => {
  await signInWithOtp(page, `xsub-${Date.now()}@test.dev`);
  const cookies = await page.context().cookies(`http://anything.${ROOT}/`);
  expect(cookies.some((c) => c.name.startsWith("sb-") && c.domain === ".localtest.me")).toBe(true);
});
