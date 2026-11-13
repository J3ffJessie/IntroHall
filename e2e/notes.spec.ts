import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { expectNoSeriousA11yViolations, latestOtp } from "./helpers";
import { seedAttendee, seedConversation, seedEvent, userIdByEmail } from "./seed";

const ROOT = "localtest.me:3000";
const db = new Pool({ connectionString: process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", max: 1 });
test.afterAll(() => db.end());

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
}

test("private notes on a connection: add from the chat, preview in the inbox, edit, clear", async ({ page }) => {
  test.setTimeout(120_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const email = `notes-${run}@test.dev`;

  await page.goto(`http://app.${ROOT}/login?next=/profile`);
  await signIn(page, email);
  await expect(page).toHaveURL((u) => u.pathname === "/profile");
  const me = await userIdByEmail(email);
  const { slug, eventId } = await seedEvent({ ownerId: me, tags: ["Rust"] });

  await page.goto(`http://${slug}.${ROOT}/join`);
  await page.getByRole("button", { name: "Rust", exact: true }).click();
  await page.getByLabel("Name").fill("Nora Notes");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "People who share your interests" })).toBeVisible();

  await seedAttendee(eventId, { name: `Dana ${run}`, tags: ["Rust"] });
  const { rows: [dana] } = await db.query(
    "select a.user_id from public.attendees a join public.accounts ac on ac.user_id = a.user_id where a.event_id = $1 and ac.full_name = $2",
    [eventId, `Dana ${run}`]);
  const conv = await seedConversation(eventId, me, dana.user_id);

  await page.goto(`http://${slug}.${ROOT}/chat/${conv}`);
  await page.getByRole("button", { name: "Add a private note" }).click();
  await page.getByLabel("Private note about Dana").fill("Runs infra at a fintech. Send her the deck.");
  await expectNoSeriousA11yViolations(page);
  await page.getByRole("button", { name: "Save note" }).click();
  const note = page.getByRole("region", { name: "Your note about Dana" });
  await expect(note).toContainText("Send her the deck.");

  // Survives a reload, and shows as a one-line preview in the inbox.
  await page.reload();
  await expect(note).toContainText("Send her the deck.");
  await page.goto(`http://${slug}.${ROOT}/inbox`);
  await expect(page.getByText("Runs infra at a fintech.")).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Edit, then clear to delete.
  await page.goto(`http://${slug}.${ROOT}/chat/${conv}`);
  await note.getByRole("button", { name: "Edit note" }).click();
  await page.getByLabel("Private note about Dana").fill("");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("button", { name: "Add a private note" })).toBeVisible();
  await page.goto(`http://${slug}.${ROOT}/inbox`);
  await expect(page.getByText("Runs infra at a fintech.")).toHaveCount(0);
});
