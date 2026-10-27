import { expect, test, type Browser, type Page } from "@playwright/test";
import { Pool } from "pg";
import { expectNoSeriousA11yViolations, latestOtp } from "./helpers";
import { seedConversation, seedEvent, userIdByEmail } from "./seed";

const ROOT = "localtest.me:3000";
const db = new Pool({ connectionString: process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", max: 1 });
test.afterAll(() => db.end());

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
}

/** A fresh attendee in their own browser context, joined with a profile holding "Rust". */
async function attendee(browser: Browser, slug: string, email: string, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`http://${slug}.${ROOT}/join`);
  await signIn(page, email);
  await page.getByRole("button", { name: "Rust", exact: true }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "People who share your interests" })).toBeVisible();
  return { ctx, page };
}

test("connect, chat in realtime, survive offline, report and block", async ({ browser }) => {
  test.setTimeout(180_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  // Organizer with a seeded event.
  const orgCtx = await browser.newContext();
  const org = await orgCtx.newPage();
  const orgEmail = `p4org-${run}@test.dev`;
  await org.goto(`http://app.${ROOT}/login?next=/profile`);
  await signIn(org, orgEmail);
  await expect(org).toHaveURL((u) => u.pathname === "/profile");
  const { slug, eventId } = await seedEvent({ ownerId: await userIdByEmail(orgEmail), tags: ["Rust", "AI"] });

  const ann = await attendee(browser, slug, `ann-${run}@test.dev`, "Ann Example");
  const ben = await attendee(browser, slug, `ben-${run}@test.dev`, "Ben Example");

  // Ann connects with a note; Ben's inbox updates live (badge + request) without reloading.
  await ann.page.reload();
  await ben.page.goto(`http://${slug}.${ROOT}/inbox`);
  const benCard = ann.page.getByRole("listitem").filter({ hasText: "Ben Example" });
  await benCard.getByRole("button", { name: "Connect with Ben" }).click();
  await benCard.getByLabel("Add a note (optional)").fill("Loved your Rust question!");
  await benCard.getByRole("button", { name: "Send request" }).click();
  await expect(benCard.getByText("Request sent")).toBeVisible();
  await expect(ben.page.getByText("“Loved your Rust question!”")).toBeVisible();
  await expect(ben.page.getByRole("link", { name: /Inbox\s*1/ })).toBeVisible();
  await expectNoSeriousA11yViolations(ben.page);

  // Ben accepts → chat opens. Ann opens the chat from her match card.
  await ben.page.getByRole("button", { name: "Accept" }).click();
  await expect(ben.page).toHaveURL(/\/chat\//);
  const chatUrl = ben.page.url().replace(`http://${slug}.${ROOT}`, "");
  await ann.page.goto(`http://${slug}.${ROOT}${chatUrl}`);
  await expect(ann.page.getByRole("heading", { name: "Ben Example" })).toBeVisible();
  await expectNoSeriousA11yViolations(ann.page);

  // Realtime: a message appears on the other side in under 1 s.
  await ann.page.getByLabel("Message Ben Example").fill("Hi Ben!");
  const sentAt = Date.now();
  await ann.page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(ben.page.getByRole("list", { name: "Messages" }).getByText("Hi Ben!")).toBeVisible({ timeout: 5_000 });
  const deliveredMs = Date.now() - sentAt;
  console.log(`realtime delivery: ${deliveredMs} ms`);
  expect(deliveredMs).toBeLessThan(1_000);

  // Offline outbox: send while offline, reconnect, exactly one copy arrives.
  await ann.ctx.setOffline(true);
  await expect(ann.page.getByText("You're offline.")).toBeVisible();
  await ann.page.getByLabel("Message Ben Example").fill("Sent from a dead zone");
  await ann.page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(ann.page.getByText("Sending…")).toBeVisible();
  await ann.page.waitForTimeout(1_500);
  await ann.ctx.setOffline(false);
  await expect(ben.page.getByRole("list", { name: "Messages" }).getByText("Sent from a dead zone")).toBeVisible({ timeout: 20_000 });
  await expect(ann.page.getByText("Sending…")).toHaveCount(0);
  const { rows } = await db.query(
    `select count(*)::int n from public.messages m join public.conversations c on c.id = m.conversation_id
      where c.event_id = $1 and m.body = 'Sent from a dead zone'`, [eventId]);
  expect(rows[0].n).toBe(1);
  await ann.page.reload();
  await expect(ann.page.getByRole("list", { name: "Messages" }).getByText("Sent from a dead zone")).toHaveCount(1);

  // Ben reports Ann's message; the organizer's queue shows it live with the snapshot.
  await org.goto(`http://app.${ROOT}/dashboard/events/${eventId}/reports`);
  await expect(org.getByText("Nothing to review.")).toBeVisible();
  const annMsg = ben.page.getByRole("list", { name: "Messages" }).getByRole("listitem").filter({ hasText: "Hi Ben!" });
  await annMsg.getByRole("button", { name: "Report" }).click();
  await ben.page.getByLabel("What happened?").fill("Testing the report flow");
  await ben.page.getByRole("button", { name: "Send report" }).click();
  await expect(ben.page.getByText("The organizers have been notified")).toBeVisible();
  await ben.page.getByRole("button", { name: "Close" }).click();
  await expect(org.getByText("Testing the report flow")).toBeVisible({ timeout: 15_000 });
  await expect(org.getByText("“Hi Ben!”")).toBeVisible();
  await expect(org.getByText("Sent from a dead zone")).toHaveCount(0);
  await expectNoSeriousA11yViolations(org);
  await org.getByRole("button", { name: "Resolve" }).click();
  await expect(org.getByText("Nothing to review.")).toBeVisible();

  // Ben blocks Ann: the chat is read-only on both sides and Ann disappears from Ben's matches.
  ben.page.once("dialog", (d) => d.accept());
  await ben.page.getByRole("button", { name: "Block" }).click();
  await expect(ben.page.getByText("closed because one of you blocked the other")).toBeVisible();
  await ann.page.reload();
  await expect(ann.page.getByText("closed because one of you blocked the other")).toBeVisible();
  await expect(ann.page.getByLabel("Message Ben Example")).toHaveCount(0);
  await ben.page.goto(`http://${slug}.${ROOT}/home`);
  await expect(ben.page.getByRole("heading", { name: "Ann Example" })).toHaveCount(0);

  await Promise.all([orgCtx.close(), ann.ctx.close(), ben.ctx.close()]);
});

test("chat catches up via the heartbeat when realtime is unavailable", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const orgCtx = await browser.newContext();
  const org = await orgCtx.newPage();
  const orgEmail = `p4cu-${run}@test.dev`;
  await org.goto(`http://app.${ROOT}/login?next=/profile`);
  await signIn(org, orgEmail);
  await expect(org).toHaveURL((u) => u.pathname === "/profile");
  const { slug, eventId } = await seedEvent({ ownerId: await userIdByEmail(orgEmail), tags: ["Rust"] });
  await orgCtx.close();

  const ann = await attendee(browser, slug, `cua-${run}@test.dev`, "Ann Catchup");
  const ben = await attendee(browser, slug, `cub-${run}@test.dev`, "Ben Catchup");
  const conv = await seedConversation(eventId, await userIdByEmail(`cua-${run}@test.dev`), await userIdByEmail(`cub-${run}@test.dev`));

  // Ben's Realtime socket is refused outright.
  await ben.page.routeWebSocket(/\/realtime\//, (ws) => ws.close());
  await ben.page.goto(`http://${slug}.${ROOT}/chat/${conv}`);
  await ann.page.goto(`http://${slug}.${ROOT}/chat/${conv}`);
  await ann.page.getByLabel("Message Ben Catchup").fill("Can you hear me?");
  await ann.page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(ann.page.getByText("Sending…")).toHaveCount(0);

  // Delivered by the 30 s heartbeat catch-up, without a reload.
  await expect(ben.page.getByRole("list", { name: "Messages" }).getByText("Can you hear me?", { exact: true }))
    .toBeVisible({ timeout: 40_000 });
  await Promise.all([ann.ctx.close(), ben.ctx.close()]);
});

test("a message seen in an open chat is not left unread in the inbox", async ({ browser }) => {
  test.setTimeout(120_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const orgCtx = await browser.newContext();
  const org = await orgCtx.newPage();
  const orgEmail = `p4rd-${run}@test.dev`;
  await org.goto(`http://app.${ROOT}/login?next=/profile`);
  await signIn(org, orgEmail);
  await expect(org).toHaveURL((u) => u.pathname === "/profile");
  const { slug, eventId } = await seedEvent({ ownerId: await userIdByEmail(orgEmail), tags: ["Rust"] });
  await orgCtx.close();

  const ann = await attendee(browser, slug, `rda-${run}@test.dev`, "Ann Reader");
  const ben = await attendee(browser, slug, `rdb-${run}@test.dev`, "Ben Reader");
  const conv = await seedConversation(eventId, await userIdByEmail(`rda-${run}@test.dev`), await userIdByEmail(`rdb-${run}@test.dev`));

  // Ben already has the chat open when Ann's message arrives.
  await ben.page.goto(`http://${slug}.${ROOT}/chat/${conv}`);
  await expect(ben.page.getByRole("heading", { name: "Ann Reader" })).toBeVisible();
  await ann.page.goto(`http://${slug}.${ROOT}/chat/${conv}`);
  await ann.page.getByLabel("Message Ben Reader").fill("Did you see this?");
  await ann.page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(ben.page.getByRole("list", { name: "Messages" }).getByText("Did you see this?", { exact: true })).toBeVisible();

  // Well within the 30 s heartbeat, Ben goes back to the inbox without replying: nothing unread.
  await ben.page.getByRole("link", { name: "← Inbox" }).click();
  await expect(ben.page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(ben.page.getByText(/unread/)).toHaveCount(0);
  await expect(ben.page.getByRole("link", { name: /^Inbox\s*\d/ })).toHaveCount(0);
  await Promise.all([ann.ctx.close(), ben.ctx.close()]);
});
