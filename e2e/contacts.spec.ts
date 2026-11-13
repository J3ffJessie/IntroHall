import { readFile } from "node:fs/promises";
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

async function download(page: Page, name: string) {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name }).click()]);
  return { filename: file.suggestedFilename(), text: await readFile((await file.path())!, "utf8") };
}

test("contact export: download connections as vCard and CSV from the inbox", async ({ page }) => {
  test.setTimeout(120_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const email = `contacts-${run}@test.dev`;

  await page.goto(`http://app.${ROOT}/login?next=/profile`);
  await signIn(page, email);
  await expect(page).toHaveURL((u) => u.pathname === "/profile");
  const me = await userIdByEmail(email);
  const { slug, eventId } = await seedEvent({ ownerId: me, tags: ["Rust"], name: `Contacts Conf ${run}` });

  await page.goto(`http://${slug}.${ROOT}/join`);
  await page.getByRole("button", { name: "Rust", exact: true }).click();
  await page.getByLabel("Name").fill("Eve Exporter");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "People who share your interests" })).toBeVisible();

  // No connections yet: nothing to export.
  await page.goto(`http://${slug}.${ROOT}/inbox`);
  await expect(page.getByRole("heading", { name: "Export contacts" })).toHaveCount(0);

  await seedAttendee(eventId, { name: `Dana Diaz ${run}`, headline: "Staff engineer", tags: ["Rust"] });
  const { rows: [dana] } = await db.query(
    `update public.accounts set company = 'Fintech, Inc.', links = '["https://dana.dev"]'::jsonb
      where full_name = $1 returning user_id`, [`Dana Diaz ${run}`]);
  const conv = await seedConversation(eventId, me, dana.user_id);
  await db.query(
    `insert into public.connection_notes (owner_attendee, about_attendee, event_id, body)
     select m.id, d.id, $1, 'Send her the deck' from public.attendees m, public.attendees d
      where m.event_id = $1 and m.user_id = $2 and d.event_id = $1 and d.user_id = $3`, [eventId, me, dana.user_id]);

  await page.reload();
  const card = page.getByRole("region", { name: "Export contacts" });
  await expect(card).toContainText("Save your connection");
  await expectNoSeriousA11yViolations(page);

  const vcf = await download(page, "Contacts (vCard)");
  expect(vcf.filename).toBe(`introhall-${slug}-contacts.vcf`);
  const card1 = vcf.text.replace(/\r\n /g, "");
  expect(card1).toContain("BEGIN:VCARD");
  expect(card1).toContain(`FN:Dana Diaz ${run}`);
  expect(card1).toContain("ORG:Fintech\\, Inc.");
  expect(card1).toContain("TITLE:Staff engineer");
  expect(card1).toContain("URL:https://dana.dev");
  expect(card1).toContain("Send her the deck");
  expect(card1).toContain(`http://${slug}.${ROOT}/chat/${conv}`);
  expect(card1).not.toContain("Eve Exporter"); // never yourself

  const csv = await download(page, "Spreadsheet (CSV)");
  expect(csv.filename).toBe(`introhall-${slug}-contacts.csv`);
  const [header, row] = csv.text.replace(/^﻿/, "").split("\r\n");
  expect(header).toBe("Name,Headline,Company,Links,Event,Connected,Note,Chat");
  expect(row).toContain(`Dana Diaz ${run},Staff engineer,"Fintech, Inc.",https://dana.dev,Contacts Conf ${run},`);
  expect(row).toContain("Send her the deck");

  // Still works after leaving the event (the inbox is gone, the export link is not).
  await db.query("update public.attendees set left_at = now() where event_id = $1 and user_id = $2", [eventId, me]);
  const res = await page.request.get(`http://${slug}.${ROOT}/contacts?format=csv`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain(`Dana Diaz ${run}`);

  // Bad format, and signed-out requests, are refused.
  expect((await page.request.get(`http://${slug}.${ROOT}/contacts?format=json`)).status()).toBe(400);
  await page.context().clearCookies();
  expect((await page.request.get(`http://${slug}.${ROOT}/contacts?format=vcf`)).status()).toBe(401);
});
