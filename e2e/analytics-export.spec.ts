import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations, signInWithOtp } from "./helpers";
import { rebuildStats, seedAttendee, seedEvent, userIdByEmail } from "./seed";

const run = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

test("organizer downloads analytics as CSV and sees the post-event summary", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const email = `csv-${run()}@test.dev`;
  await signInWithOtp(page, email);
  // Seeded events end on 2026-11-04, so this one is over and gets a summary.
  const { eventId, slug } = await seedEvent({ ownerId: await userIdByEmail(email), tags: ["Rust", "Go", "Elm"] });
  await seedAttendee(eventId, { name: "Ada", tags: ["Rust", "Go"] });
  await seedAttendee(eventId, { name: "Bo", tags: ["Rust"] });
  await rebuildStats();

  await page.goto(`/dashboard/events/${eventId}/analytics`);
  const summary = page.getByRole("region", { name: "Post-event summary" });
  await expect(summary).toContainText("2 people joined and 2 (100%) completed a profile.");
  await expect(summary).toContainText("Most popular interests: Rust (2), Go (1).");
  await expect(summary.getByRole("button", { name: "Print summary" })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`introhall-${slug}-analytics.csv`);
  const csv = await readFile(await download.path(), "utf8");
  expect(csv.startsWith("﻿Section,Item,Value\r\n")).toBe(true);
  expect(csv).toContain("Attendance,Joined,2\r\n");
  expect(csv).toContain("Interests,Rust,2\r\n");
  expect(csv).toContain("Interests,Elm,0\r\n"); // every interest, not just the top 10

  // Someone outside the organization gets nothing.
  const other = await (await browser.newContext()).newPage();
  await signInWithOtp(other, `csv-other-${run()}@test.dev`);
  const res = await other.request.get(`/dashboard/events/${eventId}/analytics/export`);
  expect(res.status()).toBe(404);
});
